import * as fs from 'fs';
import * as path from 'path';
import {
  CliDetectorLog,
  CliFlavor,
  CliFlavorSetting,
  CliResolution,
  CliVersionProbe,
  ICliDetectionResult,
  ICliEnvironment,
  ICliInstall,
  ICliRejectedCandidate,
  ICliSettings,
  ICliSwitchTargets,
  ISavedCliChoice,
  ISpawnSpec,
} from '../types';
import {
  KEEPER_CLI_EXECUTABLES,
  KEEPER_SMK_ROOT_DIR_NAME,
} from '../utils/constants';

const WINDOWS_EXECUTABLE_EXTENSION = /\.(exe|cmd|bat)$/i;
const VERSION_PATTERN = /version\s+([0-9][0-9A-Za-z.\-+]*)/i;

function executableNames(baseName: string, isWindows: boolean): string[] {
  return isWindows
    ? [`${baseName}.exe`, `${baseName}.cmd`, `${baseName}.bat`]
    : [baseName];
}

function stripExecutableExtension(name: string): string {
  return name.replace(WINDOWS_EXECUTABLE_EXTENSION, '').toLowerCase();
}

// Stable identity used to persist the user's choice
export function getCliInstallId(install: ICliInstall): string {
  return install.isCommand ? `command:${install.path}` : install.realPath;
}

// Short label, e.g. `Keeper SMK: keeper.example.com (18.1.8)`
export function getCliDisplayLabel(install: ICliInstall): string {
  let label =
    install.flavor === CliFlavor.SMK ? 'Keeper SMK' : 'Keeper Commander';
  if (install.smkHost) {
    label += `: ${install.smkHost}`;
  }
  if (install.version) {
    label += ` (${install.version})`;
  }
  return label;
}

// Label plus what is executed, for logs
export function getCliDescription(install: ICliInstall): string {
  return `${getCliDisplayLabel(install)} at ${install.path}`;
}

/**
 * Command to show the user for terminal steps such as login. The SMK wrapper is
 * usually not on PATH, so anything other than a plain `keeper` is a full path.
 */
export function getCliTerminalCommand(install: ICliInstall): string {
  if (install.isCommand) {
    return install.path;
  }
  const baseName = stripExecutableExtension(path.basename(install.path));
  if (
    install.flavor === CliFlavor.COMMANDER &&
    baseName === KEEPER_CLI_EXECUTABLES.COMMANDER
  ) {
    return KEEPER_CLI_EXECUTABLES.COMMANDER;
  }
  return /\s/.test(install.path) ? `"${install.path}"` : install.path;
}

/**
 * Argv used to run `install` with `args`. No shell is involved, except that on
 * Windows `.cmd`/`.bat` shims and OS-resolved commands go through `cmd /c`,
 * which Node can't execute directly.
 */
export function buildSpawnSpec(
  install: Pick<ICliInstall, 'path' | 'isCommand'>,
  args: string[],
  isWindows: boolean
): ISpawnSpec {
  if (install.isCommand) {
    const tokens = install.path.split(/\s+/).filter(Boolean);
    return isWindows
      ? { file: 'cmd', args: ['/c', ...tokens, ...args] }
      : { file: tokens[0], args: [...tokens.slice(1), ...args] };
  }
  if (isWindows && /\.(cmd|bat)$/i.test(install.path)) {
    return { file: 'cmd', args: ['/c', install.path, ...args] };
  }
  return { file: install.path, args };
}

export function parseCliVersion(output: string): string | undefined {
  return VERSION_PATTERN.exec(output)?.[1];
}

function isExecutableFile(file: string, isWindows: boolean): boolean {
  try {
    if (!fs.statSync(file).isFile()) {
      return false;
    }
    if (!isWindows) {
      fs.accessSync(file, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function safeRealpath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

// `.../.keeper-smk/<host>/...` -> host dir and name (the file must be inside it)
function findSmkHostDir(
  file: string
): { hostDir: string; host: string } | null {
  const parts = file.split(path.sep);
  const index = parts.lastIndexOf(KEEPER_SMK_ROOT_DIR_NAME);
  if (index === -1 || index > parts.length - 3) {
    return null;
  }
  return {
    hostDir: parts.slice(0, index + 2).join(path.sep),
    host: parts[index + 1],
  };
}

/**
 * pip writes a console script whose shebang runs Python (POSIX), or a launcher in
 * a Python `Scripts` folder (Windows). The native installer ships a binary.
 */
function isPipEntryPoint(file: string, isWindows: boolean): boolean {
  if (isWindows) {
    return /[\\/]Python[^\\/]*[\\/]Scripts[\\/][^\\/]+$/i.test(file);
  }
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(256);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytes).toString('utf8').split('\n')[0];
    return firstLine.startsWith('#!') && /python/i.test(firstLine);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function listHostDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

// An install found on disk but not yet verified with `--version`
export type CliCandidate = Omit<ICliInstall, 'version'>;

/**
 * Finds every working Keeper Commander / Keeper SMK CLI. Machine details and the
 * `--version` probe are injected so detection is testable with fake CLIs.
 *
 * Search order (earlier sources win when two candidates are the same install):
 *  1. `keeper-smk` in PATH dirs
 *  2. `<home>/.keeper-smk/<host>/bin/keeper-smk` (hosts sorted)
 *  3. `keeper` in PATH dirs, then known Commander locations
 *  4. fallback commands (`python3 -m keepercommander`), only if no Commander was found
 *
 * Installs are deduplicated by the symlink-resolved path of the executed file, so
 * `keeper -> ~/.keeper-smk/<host>/bin/keeper-smk` shows up once, as SMK.
 */
export class CliDetector {
  constructor(
    private env: ICliEnvironment,
    private probe: CliVersionProbe,
    private log: CliDetectorLog = () => undefined
  ) {}

  async detectAll(): Promise<ICliDetectionResult> {
    const candidates = this.findCandidates();

    const rejected: ICliRejectedCandidate[] = [];
    const probed = await Promise.all(
      candidates.map((candidate) => this.verify(candidate, rejected))
    );
    const installs = probed.filter(
      (install): install is ICliInstall => install !== null
    );

    if (!installs.some((install) => install.flavor === CliFlavor.COMMANDER)) {
      const fallback = await this.detectFallbackCommand();
      if (fallback) {
        installs.push(fallback);
      }
    }

    return { installs, rejected };
  }

  // Run `--version` on just these candidates (e.g. only the CLIs a switch can target)
  async verifyCandidates(
    candidates: CliCandidate[]
  ): Promise<ICliDetectionResult> {
    const rejected: ICliRejectedCandidate[] = [];
    const probed = await Promise.all(
      candidates.map((candidate) => this.verify(candidate, rejected))
    );
    return {
      installs: probed.filter(
        (install): install is ICliInstall => install !== null
      ),
      rejected,
    };
  }

  /**
   * Installs present on disk, classified and deduplicated, without running them.
   * File checks only (milliseconds), so it's cheap enough to decide which switch
   * commands to show. OS-resolved fallback commands are not included.
   */
  findCandidates(): CliCandidate[] {
    const { isWindows, pathDirs, homeDirs, knownCommanderPaths } = this.env;
    const candidates: CliCandidate[] = [];
    const seen = new Set<string>();
    const consider = (file: string): void => {
      const candidate = this.classify(file);
      if (candidate && !seen.has(candidate.realPath)) {
        seen.add(candidate.realPath);
        candidates.push(candidate);
      }
    };

    const smkNames = executableNames(KEEPER_CLI_EXECUTABLES.SMK, isWindows);
    const commanderNames = executableNames(
      KEEPER_CLI_EXECUTABLES.COMMANDER,
      isWindows
    );

    pathDirs.forEach((dir) =>
      smkNames.forEach((name) => consider(path.join(dir, name)))
    );
    for (const home of new Set(homeDirs)) {
      const root = path.join(home, KEEPER_SMK_ROOT_DIR_NAME);
      for (const host of listHostDirs(root)) {
        smkNames.forEach((name) =>
          consider(path.join(root, host, 'bin', name))
        );
      }
    }
    pathDirs.forEach((dir) =>
      commanderNames.forEach((name) => consider(path.join(dir, name)))
    );
    knownCommanderPaths.forEach(consider);

    return candidates;
  }

  /**
   * Inspect an explicit path (the `keeper-security.cli.path` setting). It's
   * classified the same way as detected candidates, so a path into an SMK venv
   * still runs through the host's wrapper.
   */
  async inspect(file: string): Promise<ICliDetectionResult> {
    const rejected: ICliRejectedCandidate[] = [];
    const candidate = this.classify(file);
    if (!candidate) {
      rejected.push({ path: file, reason: 'not an executable file' });
      return { installs: [], rejected };
    }
    const install = await this.verify(candidate, rejected);
    return { installs: install ? [install] : [], rejected };
  }

  /**
   * Classify by name and location, never by `--version` text:
   *  - under `.keeper-smk/<host>/`: SMK for that host, run through its
   *    `bin/keeper-smk` wrapper (skipped without one: the venv binary alone
   *    would talk to the wrong server)
   *  - any other `keeper-smk`: SMK with an unknown host
   *  - everything else: Commander
   */
  private classify(file: string): CliCandidate | null {
    const { isWindows } = this.env;
    if (!isExecutableFile(file, isWindows)) {
      return null;
    }
    const absolute = path.resolve(file);
    const real = safeRealpath(absolute);

    const smk = findSmkHostDir(real) ?? findSmkHostDir(absolute);
    if (smk) {
      const wrapper = executableNames(KEEPER_CLI_EXECUTABLES.SMK, isWindows)
        .map((name) => path.join(smk.hostDir, 'bin', name))
        .find((candidate) => isExecutableFile(candidate, isWindows));
      if (!wrapper) {
        this.log(
          'warn',
          `Skipping ${absolute}: it belongs to Keeper SMK host '${smk.host}', but that host has no bin/${KEEPER_CLI_EXECUTABLES.SMK} wrapper. Running the venv binary directly would use the wrong server.`
        );
        return null;
      }
      return {
        path: wrapper,
        realPath: safeRealpath(wrapper),
        flavor: CliFlavor.SMK,
        smkHost: smk.host,
      };
    }

    const isSmkName = [absolute, real].some(
      (p) =>
        stripExecutableExtension(path.basename(p)) ===
        KEEPER_CLI_EXECUTABLES.SMK
    );
    if (isSmkName) {
      return { path: absolute, realPath: real, flavor: CliFlavor.SMK };
    }
    return {
      path: absolute,
      realPath: real,
      flavor: CliFlavor.COMMANDER,
      isPip: isPipEntryPoint(real, isWindows),
    };
  }

  // Run `--version`; record why a candidate that exists isn't usable
  private async verify(
    candidate: CliCandidate,
    rejected?: ICliRejectedCandidate[]
  ): Promise<ICliInstall | null> {
    const result = await this.probe(
      buildSpawnSpec(candidate, ['--version'], this.env.isWindows)
    );
    if (!result.ok) {
      this.log(
        rejected ? 'warn' : 'info',
        `Ignoring ${candidate.path}: ${result.reason}`
      );
      rejected?.push({ path: candidate.path, reason: result.reason });
      return null;
    }
    return { ...candidate, version: parseCliVersion(result.output) };
  }

  // Fallback commands (python -m ...) are expected to fail on most machines: not reported
  private async detectFallbackCommand(): Promise<ICliInstall | null> {
    for (const command of this.env.fallbackCommands) {
      const install = await this.verify({
        path: command,
        realPath: command,
        flavor: CliFlavor.COMMANDER,
        isCommand: true,
        // `python -m keepercommander` is pip-installed by definition
        isPip: !command.startsWith(KEEPER_CLI_EXECUTABLES.COMMANDER),
      });
      if (install) {
        return install;
      }
    }
    return null;
  }
}

export function filterCliInstallsByFlavor(
  installs: ICliInstall[],
  flavor: CliFlavorSetting
): ICliInstall[] {
  return flavor === 'auto'
    ? installs
    : installs.filter((install) => install.flavor === flavor);
}

/**
 * Choose which detected CLI to use.
 *
 *  1. A saved choice that is still installed wins.
 *  2. A saved choice that is gone is an error listing what was found. There's no
 *     silent fallback: Commander and each SMK host talk to different servers and vaults.
 *  3. No saved choice and one install: use it.
 *  4. No saved choice and several: Keeper Commander, a pip install first, then
 *     other Commanders in detection order (PATH first, like a terminal). SMK
 *     (first host alphabetically) only when no Commander exists.
 *
 * A non-`auto` flavor setting filters the list first. A saved choice that exists
 * but has the other flavor is ignored, because the setting is more explicit.
 */
export function selectCli(
  detected: ICliInstall[],
  saved: ISavedCliChoice | undefined,
  flavor: CliFlavorSetting
): CliResolution {
  const installs = filterCliInstallsByFlavor(detected, flavor);

  if (saved) {
    const match = installs.find(
      (install) => getCliInstallId(install) === saved.id
    );
    if (match) {
      return {
        kind: 'active',
        install: match,
        source: 'saved',
        autoPickedFromMany: false,
      };
    }
    const existsWithOtherFlavor = detected.some(
      (install) => getCliInstallId(install) === saved.id
    );
    if (!existsWithOtherFlavor) {
      return { kind: 'savedMissing', saved, available: installs };
    }
  }

  if (installs.length === 0) {
    return { kind: 'noneFound', rejected: [] };
  }
  if (installs.length === 1) {
    return {
      kind: 'active',
      install: installs[0],
      source: 'single',
      autoPickedFromMany: false,
    };
  }

  const commanders = installs.filter(
    (install) => install.flavor === CliFlavor.COMMANDER
  );
  const smkInstalls = installs
    .filter((install) => install.flavor === CliFlavor.SMK)
    .sort((a, b) => (a.smkHost ?? a.path).localeCompare(b.smkHost ?? b.path));
  const preferred =
    commanders.find((install) => install.isPip) ??
    commanders[0] ??
    smkInstalls[0];

  return {
    kind: 'active',
    install: preferred,
    source: 'auto',
    autoPickedFromMany: true,
  };
}

// The `cli.path` override if set (no fallback when it's broken), otherwise detection
export async function resolveCli(
  detector: CliDetector,
  settings: ICliSettings,
  saved?: ISavedCliChoice
): Promise<CliResolution> {
  if (settings.path) {
    const { installs, rejected } = await detector.inspect(settings.path);
    return installs.length > 0
      ? {
          kind: 'active',
          install: installs[0],
          source: 'override',
          autoPickedFromMany: false,
        }
      : { kind: 'overrideInvalid', path: settings.path, rejected };
  }

  const { installs, rejected } = await detector.detectAll();
  const resolution = selectCli(installs, saved, settings.flavor);
  return resolution.kind === 'noneFound'
    ? { kind: 'noneFound', rejected }
    : resolution;
}

/**
 * Which "Switch to ..." options apply: SMK hosts other than the active one, and
 * Commander only while it isn't already active. With no known active CLI every
 * install is a target.
 */
export function getCliSwitchTargets(
  candidates: CliCandidate[],
  active?: Pick<ICliInstall, 'flavor' | 'path' | 'realPath' | 'isCommand'>
): ICliSwitchTargets {
  const activeId = active ? getCliInstallId(active as ICliInstall) : undefined;
  return {
    toSmk: candidates.filter(
      (c) =>
        c.flavor === CliFlavor.SMK &&
        getCliInstallId(c as ICliInstall) !== activeId
    ),
    toCommander:
      active?.flavor === CliFlavor.COMMANDER
        ? []
        : candidates.filter((c) => c.flavor === CliFlavor.COMMANDER),
  };
}
