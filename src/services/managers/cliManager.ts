import { execFile, ExecFileException } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtensionContext } from 'vscode';
import { configuration, ConfigurationKey } from '../configurations';
import {
  CliDetector,
  filterCliInstallsByFlavor,
  getCliDisplayLabel,
  getCliInstallId,
  resolveCli,
} from '../cliResolver';
import {
  CliDetectorLog,
  CliFlavor,
  CliFlavorSetting,
  CliResolution,
  CliVersionProbeResult,
  ICliEnvironment,
  ICliInstall,
  ICliSettings,
  ISavedCliChoice,
  ISpawnSpec,
} from '../../types';
import {
  CLI_SELECTED_ID_KEY,
  CLI_SELECTED_LABEL_KEY,
  CLI_VERSION_PROBE_TIMEOUT_MS,
} from '../../utils/constants';
import { logger } from '../../utils/logger';

const PYTHON_VERSIONS = ['3.9', '3.10', '3.11', '3.12', '3.13'];

const detectorLog: CliDetectorLog = (level, message) =>
  level === 'warn'
    ? logger.logInfo(`Warning: ${message}`)
    : logger.logDebug(message);

function getUsername(): string | undefined {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER ?? process.env.USERNAME;
  }
}

function describeProbeFailure(error: ExecFileException): string {
  if (error.killed || error.signal === 'SIGTERM') {
    return `'--version' did not finish within ${CLI_VERSION_PROBE_TIMEOUT_MS / 1000}s`;
  }
  if (error.code === 'ENOENT' || error.code === 'EACCES') {
    return `could not be run (${error.code})`;
  }
  return `'--version' exited with ${error.code ?? error.signal ?? 'an error'}`;
}

/**
 * Connects Keeper CLI detection (`cliResolver`) to this machine and VS Code:
 * the OS environment, the `--version` probe, `keeper-security.cli.*` settings and
 * the user's saved choice.
 */
export class CliManager {
  /**
   * The machine the extension host runs on. In Remote-SSH, WSL and dev containers
   * that's the remote side, so `process.platform`, `os.homedir()` and `PATH`
   * describe the workspace machine, not the UI machine.
   */
  static getEnvironment(): ICliEnvironment {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const home = os.homedir();

    // Under sudo the home dir is root's, but SMK is usually in the invoking user's home
    const homeDirs = [home];
    const sudoUser = process.env.SUDO_USER;
    if (!isWindows && sudoUser && sudoUser !== getUsername()) {
      homeDirs.push(isMac ? `/Users/${sudoUser}` : `/home/${sudoUser}`);
    }

    const pathDirs = (process.env.PATH ?? '')
      .split(path.delimiter)
      .filter((dir) => dir.trim().length > 0);
    if (!isWindows) {
      // VS Code launched from the Dock/Start menu often lacks these on PATH
      pathDirs.push(
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        path.join(home, '.local', 'bin')
      );
    }

    let knownCommanderPaths: string[];
    let fallbackCommands: string[];
    if (isWindows) {
      knownCommanderPaths = PYTHON_VERSIONS.map((v) =>
        v.replace('.', '')
      ).flatMap((v) => [
        `C:\\Python${v}\\Scripts\\keeper.exe`,
        path.join(
          home,
          'AppData',
          'Local',
          'Programs',
          'Python',
          `Python${v}`,
          'Scripts',
          'keeper.exe'
        ),
        path.join(
          home,
          'AppData',
          'Roaming',
          'Python',
          `Python${v}`,
          'Scripts',
          'keeper.exe'
        ),
      ]);
      // `keeper` resolved by cmd.exe, the way the extension always ran it, then Python
      fallbackCommands = [
        'keeper',
        'python -m keepercommander',
        'py -m keepercommander',
      ];
    } else if (isMac) {
      knownCommanderPaths = [
        '/usr/local/keepercommandercli/bin/keeper-commander',
        ...PYTHON_VERSIONS.flatMap((v) => [
          path.join(home, 'Library', 'Python', v, 'bin', 'keeper'),
          `/Library/Frameworks/Python.framework/Versions/${v}/bin/keeper`,
          `/opt/homebrew/opt/python@${v}/bin/keeper`,
        ]),
      ];
      fallbackCommands = [
        'python3 -m keepercommander',
        '/usr/bin/python3 -m keepercommander',
        '/opt/homebrew/bin/python3 -m keepercommander',
      ];
    } else {
      knownCommanderPaths = [
        '/opt/keeper/bin/keeper',
        '/usr/local/keepercommandercli/bin/keeper-commander',
      ];
      fallbackCommands = ['python3 -m keepercommander'];
    }

    return {
      isWindows,
      homeDirs: [...new Set(homeDirs)],
      pathDirs: [...new Set(pathDirs)],
      knownCommanderPaths,
      fallbackCommands,
    };
  }

  /**
   * `<cli> --version`: ok when it exits 0 and prints "Keeper Commander". stdin is
   * closed right away, so a CLI waiting for input ("Press <Enter> to close")
   * fails fast instead of hanging until the timeout.
   */
  static probeVersion(spec: ISpawnSpec): Promise<CliVersionProbeResult> {
    return new Promise((resolve) => {
      try {
        const child = execFile(
          spec.file,
          spec.args,
          {
            timeout: CLI_VERSION_PROBE_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
          (error, stdout, stderr) => {
            if (error) {
              resolve({ ok: false, reason: describeProbeFailure(error) });
              return;
            }
            const output = `${stdout}\n${stderr}`;
            resolve(
              /Keeper Commander/i.test(output)
                ? { ok: true, output }
                : {
                    ok: false,
                    reason: `'--version' output isn't Keeper Commander`,
                  }
            );
          }
        );
        child.stdin?.end();
      } catch (error) {
        resolve({
          ok: false,
          reason: `could not be run (${error instanceof Error ? error.message : 'unknown error'})`,
        });
      }
    });
  }

  static getSettings(): ICliSettings {
    const flavor = configuration.get<CliFlavorSetting>(
      ConfigurationKey.CliFlavor
    );
    const cliPath = configuration.get<string>(ConfigurationKey.CliPath)?.trim();
    return {
      flavor:
        flavor === CliFlavor.COMMANDER || flavor === CliFlavor.SMK
          ? flavor
          : 'auto',
      path: cliPath || undefined,
    };
  }

  static getSavedChoice(
    context: ExtensionContext
  ): ISavedCliChoice | undefined {
    const id = context.globalState.get<string>(CLI_SELECTED_ID_KEY);
    return id
      ? { id, label: context.globalState.get<string>(CLI_SELECTED_LABEL_KEY) }
      : undefined;
  }

  // Only explicit picks are saved, as the resolved path. Auto-picks are recomputed.
  static async saveChoice(
    context: ExtensionContext,
    install: ICliInstall
  ): Promise<void> {
    await context.globalState.update(
      CLI_SELECTED_ID_KEY,
      getCliInstallId(install)
    );
    await context.globalState.update(
      CLI_SELECTED_LABEL_KEY,
      getCliDisplayLabel(install)
    );
  }

  /**
   * Identity of everything that decides which CLI is used (settings and the saved
   * pick). A previously resolved CLI is only reused while this is unchanged, so a
   * switch made in another window is still picked up.
   */
  static getResolutionKey(context: ExtensionContext): string {
    return JSON.stringify([
      CliManager.getSettings(),
      CliManager.getSavedChoice(context)?.id,
    ]);
  }

  // Whether the executed file of a resolved install is still there and runnable
  static isStillAvailable(install: ICliInstall): boolean {
    if (install.isCommand) {
      // OS-resolved commands (python -m ...) can't be checked cheaply
      return false;
    }
    try {
      fs.accessSync(
        install.path,
        process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK
      );
      return true;
    } catch {
      return false;
    }
  }

  static createDetector(): CliDetector {
    return new CliDetector(
      CliManager.getEnvironment(),
      CliManager.probeVersion,
      detectorLog
    );
  }

  // Which CLI to use, from the settings, the saved choice and detection
  static resolve(context: ExtensionContext): Promise<CliResolution> {
    return resolveCli(
      CliManager.createDetector(),
      CliManager.getSettings(),
      CliManager.getSavedChoice(context)
    );
  }

  // Installs for the "Switch Keeper CLI" picker, honoring the flavor setting
  static async detectInstalls(): Promise<ICliInstall[]> {
    const { installs } = await CliManager.createDetector().detectAll();
    return filterCliInstallsByFlavor(installs, CliManager.getSettings().flavor);
  }
}
