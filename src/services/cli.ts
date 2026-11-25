import { commands, env, ExtensionContext, Uri, window } from 'vscode';
import { logger } from '../utils/logger';
import {
  getKeeperCliAutoPickedMessage,
  getKeeperCliLoginHintMessage,
  getKeeperCliNoLongerAvailableMessage,
  getKeeperCliPathInvalidMessage,
  getKeeperCliUnusableMessage,
  hasKeeperNotationControlCharacters,
  isValidKeeperRecordUid,
  promisifyExec,
  serializeCommanderShellCommand,
  StatusBarSpinner,
} from '../utils/helper';
import { execFile, spawn, ChildProcess } from 'child_process';
import {
  CLI_MULTIPLE_INSTALLS_NOTICE_SHOWN_KEY,
  COMMANDS,
  CONFIG_NAMESPACE,
  HELPER_MESSAGES,
  KEEPER_COMMANDER_DOCS_URLS,
} from '../utils/constants';
import { CLI_ERROR_MESSAGES, CLI_LOGGER_DEBUG_MESSAGES } from '../utils/cli-messages';
import { configuration } from './configurations';
import { CliManager } from './managers/cliManager';
import {
  buildSpawnSpec,
  getCliDescription,
  getCliDisplayLabel,
  getCliInstallId,
  getCliSwitchTargets,
  getCliTerminalCommand,
} from './cliResolver';
import {
  CliFlavor,
  CliUnavailableResolution,
  ICliInstall,
  ISpawnSpec,
} from '../types';

/**
 * Commands that create something in the vault. They are never re-run through the
 * legacy executor after a persistent-shell failure: the first attempt may already
 * have created the record (e.g. a stderr warning or a slow response), and a retry
 * would create a duplicate.
 */
const NON_RETRYABLE_COMMANDS = new Set(['record-add', 'nsf-record-add']);

// CLI mode command that switches to another Keeper CLI of `flavor` (read at call
// time, not import time)
function getCliSwitchAction(flavor: CliFlavor): { label: string; command: string } {
  return flavor === CliFlavor.SMK
    ? { label: HELPER_MESSAGES.SWITCH_TO_KEEPER_SMK, command: COMMANDS.SWITCH_TO_KEEPER_SMK }
    : {
        label: HELPER_MESSAGES.SWITCH_TO_KEEPER_COMMANDER,
        command: COMMANDS.SWITCH_TO_KEEPER_COMMANDER,
      };
}

function describeUnavailableCli(resolution: CliUnavailableResolution): string {
  switch (resolution.kind) {
    case 'noneFound':
      return resolution.rejected.length > 0
        ? getKeeperCliUnusableMessage(
            resolution.rejected.map((r) => `${r.path} (${r.reason})`)
          )
        : HELPER_MESSAGES.CLI_NOT_INSTALLED;
    case 'overrideInvalid':
      return getKeeperCliPathInvalidMessage(resolution.path, resolution.rejected[0]?.reason);
    case 'savedMissing':
      return getKeeperCliNoLongerAvailableMessage(
        resolution.saved.label ?? resolution.saved.id,
        resolution.available.map(getCliDisplayLabel)
      );
  }
}

// Thrown when no usable Keeper CLI is selected (none found, saved choice gone, bad override)
class CliUnavailableError extends Error {
  constructor(public readonly resolution: CliUnavailableResolution) {
    super(describeUnavailableCli(resolution));
    this.name = 'CliUnavailableError';
  }
}

// Patterns to filter out from Keeper Commander output (not real errors)
const BENIGN_PATTERNS = [
  /Logging in to Keeper Commander/i,
  /Attempting biometric authentication/i,
  /Successfully authenticated with Biometric Login/i,
  /Press Ctrl\+C to skip biometric/i,
  /and use default login method/i,
  /Syncing\.\.\./i,
  /Decrypted\s*\[\d+\]\s*record\(s\)/i,
  // Linux warnings from newer Commander: it falls back and carries on
  /QRC encryption failed/i,
  /Failed to initialize platform handler/i,
  /^keeper shell$/i,
  /^\r$/, // stray carriage returns
];

// Remove benign noise from command output to focus on real errors
function cleanCommanderNoise(text: string): string {
  if (!text) {
    return '';
  }

  let out = text;
  for (const rx of BENIGN_PATTERNS) {
    out = out.replace(new RegExp(rx.source + '.*?(\\n|$)', 'gim'), '');
  }

  return out.trim();
}

// Check if output contains actual error messages (not just noise)
function isRealError(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  // if only benign lines remain, treat as non-error
  const cleaned = cleanCommanderNoise(t);
  if (!cleaned) {
    return false;
  }
  // conservative error keywords
  return /(error|failed|exception|traceback)/i.test(cleaned);
}

// Extract command output between echoed command and shell prompt
function extractCommandOutput(
  fullOutput: string,
): string {
  const delimiter = "My Vault>";
  const lastIndex = fullOutput.lastIndexOf(delimiter);

  if (lastIndex === -1) {
    return fullOutput.trim();
  }

  const extractedOutput = fullOutput.substring(0, lastIndex).trim();
  return extractedOutput;
}

// Commander prints its generic help (headed by this line) when it does not
// recognise a command, e.g. `nsf-*` commands for accounts without nested share folders
const UNKNOWN_COMMAND_OUTPUT_PATTERN = /^\s*Available Commands\s*$/m;

// Create a special error type that won't trigger persistent mode fallback
class CommandBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandBlockedError';
  }
}

export class CliService {
  private isInstalled: boolean = false;
  private isAuthenticated: boolean = false;
  private persistentProcess: ChildProcess | null = null;
  private isInitialized = false;
  private usePersistentProcess = false;
  private shellReady = false;
  private shellReadyPromise: Promise<void> | null = null;
  private isExecutingCommand = false;
  // null = not yet known; resolved from the first nsf-* command output
  private nsfSupported: boolean | null = null;
  // Resolved on first use and after every reset, so a removed CLI is noticed
  private activeCli: ICliInstall | null = null;
  // In-flight resolution, shared so concurrent actions detect only once
  private activeCliPromise: Promise<ICliInstall> | null = null;
  // Bumped on every reset, so a detection that finishes after a reset is not cached
  private cliGeneration = 0;
  // Last verified CLI, kept across automatic resets (10-minute timer, process exit,
  // expired login) so they don't re-probe every candidate. Dropped when the user
  // switches or changes settings, or when its file is gone.
  private knownCli: { install: ICliInstall; key: string } | null = null;

  // Add reset cli timeout
  private resetCliTimeout: NodeJS.Timeout | null = null;
  private readonly RESET_CLI_INTERVAL = 10 * 60 * 1000; // 10 minutes

  public constructor(
    private context: ExtensionContext,
    private spinner: StatusBarSpinner
  ) {
    // Restart the shell with the new CLI when keeper-security.cli.* changes
    // Show the right "Switch to Keeper SMK/Commander" commands from the start
    this.refreshSwitchContext();

    this.context.subscriptions.push(
      configuration.onDidChange((event) => {
        if (event.affectsConfiguration(`${CONFIG_NAMESPACE}.cli`)) {
          logger.logInfo(CLI_LOGGER_DEBUG_MESSAGES.KEEPER_CLI_SETTINGS_CHANGED);
          this.knownCli = null;
          this.resetCliService();
        }
      })
    );
  }

  // The CLI currently in use, or null before the first action / after a reset
  public getActiveCli(): ICliInstall | null {
    return this.activeCli;
  }

  public getActiveCliId(): string | null {
    return this.activeCli ? getCliInstallId(this.activeCli) : null;
  }

  // Every working Keeper CLI on this machine, for the switch commands' pickers
  public detectInstalls(): Promise<ICliInstall[]> {
    return CliManager.detectInstalls();
  }

  // Stop the running shell so the next action starts with the newly saved CLI
  public switchCli(): void {
    this.knownCli = null;
    this.resetCliService();
    this.refreshSwitchContext();
  }

  // Resolve which CLI to execute; cached until the next reset
  private ensureActiveCli(): Promise<ICliInstall> {
    if (this.activeCli) {
      return Promise.resolve(this.activeCli);
    }
    if (!this.activeCliPromise) {
      const pending = this.resolveActiveCli().finally(() => {
        if (this.activeCliPromise === pending) {
          this.activeCliPromise = null;
        }
      });
      this.activeCliPromise = pending;
    }
    return this.activeCliPromise;
  }

  private async resolveActiveCli(): Promise<ICliInstall> {
    const generation = this.cliGeneration;
    const key = CliManager.getResolutionKey(this.context);

    // Same settings and saved pick, and the file is still there: no need to detect again
    if (
      this.knownCli !== null &&
      this.knownCli.key === key &&
      CliManager.isStillAvailable(this.knownCli.install)
    ) {
      this.activeCli = this.knownCli.install;
      this.refreshSwitchContext();
      return this.knownCli.install;
    }
    this.knownCli = null;

    const resolution = await CliManager.resolve(this.context);
    if (resolution.kind !== 'active') {
      throw new CliUnavailableError(resolution);
    }

    // A reset while detecting means the result may be stale (settings/switch changed)
    if (generation === this.cliGeneration) {
      this.activeCli = resolution.install;
      this.refreshSwitchContext();
      this.knownCli = { install: resolution.install, key };
    }
    logger.logInfo(
      `Active Keeper CLI: ${getCliDescription(resolution.install)} (${resolution.source})`
    );
    if (resolution.autoPickedFromMany) {
      void this.notifyAutoPickedOnce(resolution.install);
    }
    return resolution.install;
  }

  // One-time notice when several CLIs exist and none was chosen explicitly
  private async notifyAutoPickedOnce(install: ICliInstall): Promise<void> {
    if (this.context.globalState.get<boolean>(CLI_MULTIPLE_INSTALLS_NOTICE_SHOWN_KEY)) {
      return;
    }
    await this.context.globalState.update(CLI_MULTIPLE_INSTALLS_NOTICE_SHOWN_KEY, true);
    const { toSmk, toCommander } = getCliSwitchTargets(
      CliManager.findCandidates(),
      install
    );
    await this.showWithSwitchActions(
      (message, ...actions) => window.showInformationMessage(message, ...actions),
      getKeeperCliAutoPickedMessage(getCliDisplayLabel(install)),
      [
        ...(toCommander.length > 0 ? [CliFlavor.COMMANDER] : []),
        ...(toSmk.length > 0 ? [CliFlavor.SMK] : []),
      ]
    );
  }

  // Message with "Switch to Keeper Commander/SMK" buttons for the given flavors
  private async showWithSwitchActions(
    show: (message: string, ...actions: string[]) => Thenable<string | undefined>,
    message: string,
    flavors: CliFlavor[]
  ): Promise<void> {
    const actions = [...new Set(flavors)].map(getCliSwitchAction);
    const picked = await show(message, ...actions.map((action) => action.label));
    const action = actions.find((candidate) => candidate.label === picked);
    if (action) {
      await commands.executeCommand(action.command);
    }
  }

  // Keep the "Switch to Keeper SMK/Commander" commands in step with the active CLI
  private refreshSwitchContext(): void {
    Promise.resolve(
      CliManager.updateSwitchContext(this.context, this.activeCli)
    ).catch((error) =>
      logger.logError('Failed to update the Keeper CLI switch commands', error)
    );
  }

  private spawnSpec(install: ICliInstall, args: string[]): ISpawnSpec {
    return buildSpawnSpec(install, args, process.platform === 'win32');
  }

  // Lazy initialization method - only runs when first needed
  private async lazyInitialize(): Promise<void> {
    if (this.isInitialized) {
      logger.logDebug(
        'CliService.lazyInitialize: Already initialized, skipping'
      );
      return;
    }

    try {
      logger.logDebug('CliService.lazyInitialize: Starting initialization');
      this.spinner.show('Initializing Keeper Security Extension...');

      // Decide which CLI (Commander or an SMK host) to run before anything else.
      // No silent fallback: each CLI talks to a different server and vault.
      try {
        await this.ensureActiveCli();
      } catch (error) {
        if (error instanceof CliUnavailableError) {
          logger.logError(error.message);
          this.isInstalled = false;
          this.isAuthenticated = false;
          this.spinner.hide();
          await this.promptCliUnavailableError(error);
          return;
        }
        throw error;
      }

      logger.logDebug(
        'CliService.lazyInitialize: Checking commander installation and authentication'
      );
      // Check both installation and authentication concurrently for efficiency
      const [isInstalled, isAuthenticated] = await Promise.all([
        this.checkCommanderInstallation(),
        this.checkCommanderAuth(),
      ]);

      this.isInstalled = isInstalled;
      this.isAuthenticated = isAuthenticated;
      logger.logDebug(
        `CliService.lazyInitialize: Installation check: ${isInstalled}, Authentication check: ${isAuthenticated}`
      );

      if (!isInstalled) {
        logger.logError('Keeper Commander CLI is not installed');
        this.spinner.hide();
        await this.promptCommanderInstallationError();
        return;
      }

      if (!isAuthenticated) {
        logger.logError('Keeper Commander CLI is not authenticated');
        this.spinner.hide();
        await this.promptManualAuthenticationError();
        return;
      }

      logger.logDebug(
        'CliService.lazyInitialize: Switching to persistent process mode'
      );

      // After successful auth check, switch to persistent process mode for better performance
      this.usePersistentProcess = true;
      this.isInitialized = true;

      // Start the reset cli timer
      this.startResetCliTimer();

      logger.logInfo('Keeper Security Extension initialized successfully');
    } catch (error) {
      logger.logError(
        'Failed to initialize Keeper Security Extension status',
        error
      );
      this.isInstalled = false;
      this.isAuthenticated = false;
    } finally {
      this.spinner.hide();
    }
  }

  // Start the reset timer
  private startResetCliTimer(): void {
    // Clear any existing timer
    if (this.resetCliTimeout) {
      clearTimeout(this.resetCliTimeout);
    }

    // Set new timer for 10 minutes
    this.resetCliTimeout = setTimeout(() => {
      logger.logInfo('Resetting CLI service after 10 minutes to handle potential config changes');
      this.resetCliService();
    }, this.RESET_CLI_INTERVAL);
  }

  // Reset all CLI service state
  private resetCliService(): void {
    logger.logInfo('Resetting CLI service state...');

    this.spinner.hide();

    // Clear reset timer
    if (this.resetCliTimeout) {
      clearTimeout(this.resetCliTimeout);
      this.resetCliTimeout = null;
    }

    // Reset all state
    this.isInstalled = false;
    this.isAuthenticated = false;
    this.isInitialized = false;
    this.usePersistentProcess = false;
    this.shellReady = false;
    this.shellReadyPromise = null;
    this.isExecutingCommand = false;
    this.nsfSupported = null;
    // Re-resolve on next use so settings changes, switches and removed CLIs apply
    this.activeCli = null;
    this.activeCliPromise = null;
    this.cliGeneration++;

    // Kill and clear persistent process
    if (this.persistentProcess) {
      this.persistentProcess.kill();
      this.persistentProcess = null;
    }

    logger.logInfo('CLI service state reset completed');
  }

  // Check if Keeper Commander CLI is installed by running --version
  private async checkCommanderInstallation(): Promise<boolean> {
    try {
      // Detection already ran `--version` on this exact file and read a version
      // from it, so don't start another (slow) Commander process to ask again.
      if (this.activeCli?.version) {
        logger.logInfo(`Keeper Commander CLI Installed: YES`);
        return true;
      }

      // Use the legacy method for initial checks (before persistent process is ready)
      const stdout = await this.executeCommanderCommandLegacy('--version');

      // Look for version string in output
      const isInstalled = stdout.includes('version');
      logger.logInfo(`Keeper Commander CLI Installed: YES`);

      return isInstalled;
    } catch (error: unknown) {
      logger.logError(
        'Keeper Commander CLI Installation check failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  // Check if user is authenticated with Keeper Commander
  private async checkCommanderAuth(): Promise<boolean> {
    /**
     * TODO: IN FUTURE WE WILL NOT USE this-device command, WILL USE 'login-status' command instead
     * CURRENTLY THAT COMMAND IS NOT RELEASED YET
     */
    if (this.activeCli) {
      logger.logInfo(`Checking login for ${getCliDescription(this.activeCli)}`);
    }
    try {
      // Create timeout promise to prevent hanging on interactive login prompts
      let timeoutId: NodeJS.Timeout | null = null;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Must be asking for interactive login')),
          5 * 60 * 1000 // 5 minutes timeout for auth check
        );
      });

      // Create execution promise for the actual auth check
      /**
       * We have updated below command to use 'login-status' command instead of 'this-device' command bec 'this-device' takes long time based upon the data in vault.
       * 'login-status' command returns "Logged in" or "Not logged in" based upon if persistent login is on or off which is much faster to execute.
       * 
       */

      // const execPromise = this.executeCommanderCommandLegacyRaw('this-device');
      const execPromise = this.executeCommanderCommandLegacyRaw('login-status'); // this returns "Logged in" or "Not logged in" based upon if persistent login is on or off

      // Race between execution and timeout to prevent hanging
      const { stdout, stderr } = await Promise.race([
        execPromise,
        timeoutPromise,
      ]);

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const out = `${stdout}\n${stderr}`;
      
      // const persistentOn = /Persistent Login:\s*ON/i.test(out);
      const isUserLoggedIn =
        /Not logged in/i.test(out) ? false : /Logged in/i.test(out);


      // If persistent login is on, we're authenticated
      if (isUserLoggedIn) {
        logger.logInfo(`Keeper Commander CLI Authenticated: YES (Persistent)`);
        return true;
      }

      // Check for biometric authentication
      const biometricDetected = await this.checkBiometricAuthentication();

      if (biometricDetected) {
        logger.logInfo(`Keeper Commander CLI Authenticated: YES (Biometric)`);
        return true;
      }

      logger.logInfo('Keeper Commander CLI Authenticated: NO');
      return false;
    } catch (error: unknown) {
      logger.logError(
        'Keeper Commander CLI Authentication check failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  // Check biometric authentication
  private async checkBiometricAuthentication(): Promise<boolean> {
    try {
      // Look for biometric authentication hints in output
      const biometricHints = [
        /Status:\s*SUCCESSFUL/i,
        /Press Ctrl\+C to skip biometric/i,
        /Attempting biometric authentication/i,
        /Successfully authenticated with Biometric Login/i,
        /Syncing\.\.\./i,
        /Decrypted\s*\[\d+\]\s*record\(s\)/i,
      ];
      let biometricTimeoutId: NodeJS.Timeout | null = null;

      const biometricTimeoutPromise = new Promise<never>((_, reject) => {
        biometricTimeoutId = setTimeout(
          () => reject(new Error('Must be asking for interactive login')),
          30 * 1000 // 30 seconds timeout for auth check
        );
      });

      const execPromise = this.executeCommanderCommandLegacyRaw('biometric', [
        'verify',
      ]);

      const { stdout, stderr } = await Promise.race([
        execPromise,
        biometricTimeoutPromise,
      ]);

      if (biometricTimeoutId) {
        clearTimeout(biometricTimeoutId);
        biometricTimeoutId = null;
      }

      const biometricVerify = `${stdout}\n${stderr}`;

      const biometricDetected = biometricHints.some((rx) => rx.test(biometricVerify));

      return biometricDetected;
    } catch (error) {
      logger.logError('Biometric authentication check failed:', error);
      return false;
    }
  }

  /**
   * Raw executor for the Keeper Commander CLI (no output cleaning).
   *
   * Spawns the resolved Keeper CLI (Commander or an SMK host's `keeper-smk`
   * wrapper, see `cliResolver`) directly via `execFile` with a pre-tokenized
   * argv. No shell is involved, so shell metacharacters in `command` or `args`
   * (`;`, `&&`, `|`, `$`, backticks, redirections, globs, ...) are passed
   * to the child as plain bytes and cannot be interpreted as syntax. This
   * is the structural defense behind `assertSafeCommanderArgs` — the regex
   * is the policy, this is the mechanism.
   *
   * On Windows, `.cmd`/`.bat` shims and OS-resolved commands are routed
   * through `cmd /c` (see `buildSpawnSpec`). Args are still passed as a
   * tokenized array; cmd.exe receives them as separate argv entries, not
   * concatenated into a string.
   *
   * `command` must be a single argv token (e.g. `"get"`, `"login-status"`).
   * Multi-word subcommands such as `biometric verify` must be passed as
   * `("biometric", ["verify"])`.
   */
  private async executeCommanderCommandLegacyRaw(
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string }> {
    // Cached CLI is used synchronously; detection only runs after a reset
    const cli = this.activeCli ?? (await this.ensureActiveCli());
    const { file, args: argv } = this.spawnSpec(cli, [command, ...args]);

    const { stdout, stderr } = await promisifyExec(execFile)(file, argv, {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: String(stdout || ''), stderr: String(stderr || '') };
  }

  // keep the cleaned version for normal use
  public async executeCommanderCommandLegacy(
    command: string,
    args: string[] = []
  ): Promise<string> {
    try {
      const { stdout, stderr } = await this.executeCommanderCommandLegacyRaw(
        command,
        args
      );

      const cleanStdout = cleanCommanderNoise(stdout);
      const cleanStderr = cleanCommanderNoise(stderr);

      if (isRealError(cleanStderr)) {
        throw new Error(cleanStderr);
      }
      return cleanStdout || stdout;
    } catch (error) {
      logger.logError(`Legacy commander command failed`, error);
      throw error;
    }
  }

  private assertSafeCommanderArgs(command: string, args: string[]): void {
    for (const arg of args) {
      if (hasKeeperNotationControlCharacters(arg)) {
        throw new Error(CLI_ERROR_MESSAGES.INVALID_COMMANDER_ARGUMENT);
      }
    }

    if (command === 'get' && args.length > 0 && !isValidKeeperRecordUid(args[0])) {
      throw new Error(CLI_ERROR_MESSAGES.INVALID_COMMANDER_RECORD_UID);
    }
  }

  public async executeCommanderCommand(
    command: string,
    args: string[] = []
  ): Promise<string> {
    this.assertSafeCommanderArgs(command, args);

    // Initialize on first use
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    // If initialization failed or persistent process is disabled, use legacy method
    if (!this.usePersistentProcess) {
      logger.logInfo(`Using legacy mode for command: ${command}`);
      return this.executeCommanderCommandLegacy(command, args);
    }

    try {
      return await this.executeCommanderCommandPersistent(command, args);
    } catch (error) {
      // Don't fallback to legacy mode for blocked commands
      if (error instanceof CommandBlockedError) {
        throw error; // Re-throw without disabling persistent mode
      }

      if (NON_RETRYABLE_COMMANDS.has(command)) {
        // The record may already exist; retrying would create a duplicate.
        logger.logError(
          `Persistent process failed for ${command}; not retrying, to avoid creating a duplicate record`,
          error
        );
        this.resetCliService();
        throw error;
      }

      logger.logError(`Persistent process failed, falling back to legacy mode:`, error);
      this.usePersistentProcess = false;

      // Reset CLI service when falling back to legacy mode
      this.resetCliService();

      return this.executeCommanderCommandLegacy(command, args);
    }
  }

  /**
   * Executes an `nsf-*` command. Returns `null` without running anything once
   * nested share folders are known to be unsupported for the account, or when
   * Commander does not recognise the command. Support is cached until the CLI
   * service resets; failed commands are not cached so transient errors do not
   * disable NSF for the session.
   */
  public async executeNsfCommand(
    command: string,
    args: string[] = []
  ): Promise<string | null> {
    if (this.nsfSupported === false) {
      logger.logDebug(`Skipping ${command}: nested share folders are not supported`);
      return null;
    }

    const output = await this.executeCommanderCommand(command, args);

    if (UNKNOWN_COMMAND_OUTPUT_PATTERN.test(output)) {
      logger.logInfo(
        `Commander did not recognise ${command}; nested share folders are not supported for this account`
      );
      this.nsfSupported = false;
      return null;
    }

    this.nsfSupported = true;
    return output;
  }

  // Check whether nested share folder (nsf-*) commands are available, probing once if unknown
  public async isNsfSupported(): Promise<boolean> {
    if (this.nsfSupported !== null) {
      return this.nsfSupported;
    }

    this.spinner.show('Checking nested share folder support...');
    try {
      await this.executeNsfCommand('nsf-list', ['--records', '--format=json']);
    } catch (error) {
      logger.logError('Failed to check nested share folder support', error);
      return false;
    } finally {
      this.spinner.hide();
    }

    return this.nsfSupported ?? false;
  }

  // Simple persistent command execution with timeout protection (NO persistent mode kill)
  private async executeCommanderCommandPersistent(
    command: string,
    args: string[]
  ): Promise<string> {
    // Ensure shell process is ready
    await this.ensurePersistentProcess();

    // Check if another command is running
    if (this.isExecutingCommand) {
      logger.logInfo(`Command ${command} blocked - another command is executing`);

      // Throw special error that won't trigger persistent mode fallback
      throw new CommandBlockedError(`Another Keeper command is currently running. Please wait for it to complete and try again or reload the window.`);
    }

    // Set executing flag
    this.isExecutingCommand = true;

    try {
      // Execute the command directly in the persistent process
      const result = await this.executeCommandInProcess(command, args);
      return result;
    } finally {
      // Always clear the flag
      this.isExecutingCommand = false;
    }
  }

  // Ensure persistent process exists and is ready to accept commands
  private async ensurePersistentProcess(): Promise<void> {
    if (!this.persistentProcess || this.persistentProcess.killed) {
      // Create new process if needed
      await this.createPersistentProcess();
    }
    if (!this.shellReady && this.shellReadyPromise) {
      // Wait for shell to be ready
      await this.shellReadyPromise;
    }
  }

  // Create new persistent Keeper Commander shell process
  private async createPersistentProcess(): Promise<void> {
    try {
      this.shellReady = false;
      this.shellReadyPromise = null;

      // Cached CLI is used synchronously; detection only runs after a reset
      const cli = this.activeCli ?? (await this.ensureActiveCli());
      logger.logInfo(`Creating persistent Keeper shell process with ${getCliDescription(cli)}...`);

      // Platform-aware argv (cmd /c for Windows .cmd shims), never a shell string
      const { file, args } = this.spawnSpec(cli, ['shell']);
      this.persistentProcess = spawn(file, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      // Handle process creation errors
      this.persistentProcess.on('error', (error) => {
        logger.logError('Persistent process error:', error);
        this.handleProcessError();
      });

      // Handle process exit
      this.persistentProcess.on('exit', (code) => {
        logger.logInfo(`Persistent process exited with code: ${code}`);
        this.handleProcessExit();
      });

      // Startup listeners: consume noise until shell is ready
      const onStdoutStartup = (chunk: Buffer): void => {
        const data = chunk.toString();

        // Look for shell prompt
        if (data.includes('My Vault>')) {
          // Remove startup listener
          this.persistentProcess?.stdout?.off('data', onStdoutStartup);

          // Mark shell as ready for commands
          this.shellReady = true;
        }
      };
      this.persistentProcess.stdout?.on('data', onStdoutStartup);

      // readiness promise with timeout
      this.shellReadyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Keeper Commander Shell ready timeout')),
          120000 // 2 minutes timeout
        );
        const onReady = (chunk: Buffer): void => {
          const data = chunk.toString();
          if (data.includes('My Vault>')) {
            clearTimeout(timeout);
            this.persistentProcess?.stdout?.off('data', onReady);
            resolve();
          }
        };
        this.persistentProcess?.stdout?.on('data', onReady);
      });

      await this.shellReadyPromise;
      logger.logInfo('Persistent Keeper Commander process ready');
    } catch (error) {
      logger.logError('Failed to create persistent process:', error);
      // Clean up any partial state
      this.handleProcessError();

      // Re-throw the error so caller knows it failed
      throw error;
    }
  }

  private async executeCommandInProcess(
    command: string,
    args: string[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const errorMessage = `Command execution timeout: ${command} ${args.join(' ')}`;
        logger.logError(errorMessage);

        // Show error notification to user
        window.showErrorMessage(
          `Keeper Command Timeout:`,
          'The command took too long to execute and timed out after 5 minutes. Please reload the window and try again.'
        );

        this.spinner.hide();

        // Complete reset after timeout
        this.resetCliService();

        reject(new Error('Command execution timeout'));
      }, 300000); // 5 minutes timeout

      // Accumulate stdout for command result
      let output = '';
      let errorOutput = '';
      let biometricPromptHandled = false;

      // Track the last time new data was received
      let lastDataTime = Date.now();
      let checkCompletionTimeout: NodeJS.Timeout | null = null;

      // Handle stdout data from Keeper process
      const onStdout = (data: string): void => {
        const dataStr = data.toString();

        // Update timestamp when new data arrives
        lastDataTime = Date.now();

        // Handle biometric authentication prompts automatically
        if (dataStr.includes('Press Ctrl+C to skip biometric')) {
          if (!biometricPromptHandled) {
            biometricPromptHandled = true;
            logger.logInfo('Biometric prompt detected, sending Ctrl+C to skip...');
            // Send Ctrl+C to skip biometric authentication
            this.persistentProcess?.stdin?.write('\x03');

            setTimeout(() => {
              this.persistentProcess?.stdin?.write(
                serializeCommanderShellCommand(command, args)
              );
            }, 500); // 0.5 seconds timeout
            return;
          }
        }

        // Check for authentication expiration
        if (dataStr.includes('Not logged in')) {
          this.spinner.hide();
          cleanup();
          this.handleAuthenticationExpired();
          reject(new Error('Keeper session expired. Please log in again manually or reload the window and try again.'));
          return;
        }

        // Add to output if not biometric prompt
        if (!dataStr.includes('Press Ctrl+C to skip biometric')) {
          output += dataStr;
        }
      };

      // Handle stderr data
      const onStderr = (data: string): void => {
        const dataStr = data.toString();

        if (dataStr.includes('Not logged in')) {
          this.spinner.hide();
          cleanup();
          this.handleAuthenticationExpired();
          reject(new Error('Authentication expired. Please log in again.'));
          return;
        }

        errorOutput += dataStr;
      };

      // Clean up event listeners and timeouts
      const cleanup = (): void => {
        clearTimeout(timeout);
        if (checkCompletionTimeout) {
          clearTimeout(checkCompletionTimeout);
          checkCompletionTimeout = null;
        }
        this.persistentProcess?.stdout?.off('data', onStdout);
        this.persistentProcess?.stderr?.off('data', onStderr);
      };

      // Listen for stdout events directly on the process
      this.persistentProcess?.stdout?.on('data', onStdout);
      // Listen for stderr events directly on the process
      this.persistentProcess?.stderr?.on('data', onStderr);

      // Send command to Keeper Commander process via stdin
      this.persistentProcess?.stdin?.write(
        serializeCommanderShellCommand(command, args)
      );

      // Wait for command completion by checking for shell prompt
      const checkCompletion = (): void => {
        const now = Date.now();
        const timeSinceLastData = now - lastDataTime;

        // If no new data for 5 seconds AND output ends with shell prompt
        if (timeSinceLastData >= 5000 && (output.endsWith('My Vault>') || output.endsWith('My Vault> '))) {
          // Clean up listeners and timeouts
          cleanup();

          // Extract output between command echo and shell prompt
          const cleanOut = extractCommandOutput(output);

          // Clean benign noise from stderr only (stdout is already clean)
          const cleanErr = cleanCommanderNoise(errorOutput);

          // Check if stderr contains real errors
          if (isRealError(cleanErr)) {
            reject(new Error(cleanErr));
          } else {
            resolve(cleanOut);
          }
        } else {
          // Clear any existing timeout before setting a new one
          if (checkCompletionTimeout) {
            clearTimeout(checkCompletionTimeout);
          }
          // Check again in 100ms if no prompt yet
          checkCompletionTimeout = setTimeout(checkCompletion, 100);
        }
      };

      // Start checking for completion
      checkCompletion();
    });
  }

  // Simple authentication expiration handler
  private handleAuthenticationExpired(): void {
    // Keep the CLI for the login hint; the reset clears it
    const cli = this.activeCli;

    // Reset CLI service when authentication expires
    this.resetCliService();

    this.promptManualAuthenticationError(cli);
  }

  // Enhanced error handling with detailed logging
  private handleProcessError(): void {
    logger.logError('Handling process error');

    // Reset CLI service to recover from process errors
    this.resetCliService();
  }

  // Enhanced process exit handling with detailed logging
  private handleProcessExit(): void {
    logger.logInfo('Handling process exit');

    // Reset CLI service when process exits unexpectedly
    this.resetCliService();
  }

  // Show user-friendly error when Keeper Commander is not installed
  private async promptCommanderInstallationError(
    message: string = HELPER_MESSAGES.CLI_NOT_INSTALLED
  ): Promise<void> {
    const action = await window.showErrorMessage(
      message,
      HELPER_MESSAGES.OPEN_INSTALLATION_DOCS
    );

    if (action === HELPER_MESSAGES.OPEN_INSTALLATION_DOCS) {
      const docsUrl = Uri.parse(KEEPER_COMMANDER_DOCS_URLS.INSTALLATION);
      // Open installation documentation
      env.openExternal(docsUrl);
    }
  }

  // No usable CLI: none installed, saved choice removed, or invalid cli.path override
  private async promptCliUnavailableError(error: CliUnavailableError): Promise<void> {
    const { resolution } = error;
    if (resolution.kind === 'noneFound') {
      // Includes which files were found but unusable, and why
      await this.promptCommanderInstallationError(error.message);
      return;
    }

    if (resolution.kind === 'overrideInvalid') {
      const action = await window.showErrorMessage(
        error.message,
        HELPER_MESSAGES.OPEN_SETTINGS
      );
      if (action === HELPER_MESSAGES.OPEN_SETTINGS) {
        await commands.executeCommand(
          'workbench.action.openSettings',
          `${CONFIG_NAMESPACE}.cli`
        );
      }
      return;
    }

    // Saved CLI is gone: offer to switch to what's still installed, never automatically
    await this.showWithSwitchActions(
      (message, ...actions) => window.showErrorMessage(message, ...actions),
      error.message,
      resolution.available.map((install) => install.flavor)
    );
  }

  // Show user-friendly error when authentication fails
  private async promptManualAuthenticationError(
    cli: ICliInstall | null = this.activeCli
  ): Promise<void> {
    // Name the CLI in use and its real command: the SMK wrapper isn't on PATH,
    // and each CLI has its own login.
    const message = cli
      ? `${HELPER_MESSAGES.CLI_NOT_AUTHENTICATED} ${getKeeperCliLoginHintMessage(
          getCliDisplayLabel(cli),
          getCliTerminalCommand(cli)
        )}`
      : HELPER_MESSAGES.CLI_NOT_AUTHENTICATED;
    const action = await window.showErrorMessage(
      message,
      HELPER_MESSAGES.OPEN_AUTHENTICATION_DOCS
    );

    if (action === HELPER_MESSAGES.OPEN_AUTHENTICATION_DOCS) {
      const docsUrl = Uri.parse(KEEPER_COMMANDER_DOCS_URLS.AUTHENTICATION);
      // Open authentication documentation
      env.openExternal(docsUrl);
    }
  }

  // Check if CLI is ready to execute commands
  public async isCLIReady(): Promise<boolean> {
    // Lazy initialize if not done yet
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    if (!this.isInstalled || !this.isAuthenticated) {
      return false;
    }

    return true;
  }

  // Enhanced disposal with cleanup
  public dispose(): void {
    logger.logDebug('Disposing CLI service');

    // Clear reset timer
    if (this.resetCliTimeout) {
      clearTimeout(this.resetCliTimeout);
      this.resetCliTimeout = null;
    }

    // Kill persistent process
    if (this.persistentProcess) {
      this.persistentProcess.kill();
      this.persistentProcess = null;
    }

    logger.logDebug('CLI service disposed');
  }
}
