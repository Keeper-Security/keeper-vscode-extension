import { env, ExtensionContext, Uri, window } from 'vscode';
import { logger } from '../utils/logger';
import { promisifyExec, StatusBarSpinner } from '../utils/helper';
import { exec, spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { KEEPER_COMMANDER_DOCS_URLS } from '../utils/constants';
import { HELPER_MESSAGES } from '../utils/constants';

// Patterns to filter out from Keeper Commander output (not real errors)
const BENIGN_PATTERNS = [
  /Logging in to Keeper Commander/i,
  /Attempting biometric authentication/i,
  /Successfully authenticated with Biometric Login/i,
  /Press Ctrl\+C to skip biometric/i,
  /and use default login method/i,
  /Syncing\.\.\./i,
  /Decrypted\s*\[\d+\]\s*record\(s\)/i,
  /keeper shell/i,
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

export class CliService {
  private isInstalled: boolean = false;
  private isAuthenticated: boolean = false;

  // Lazy initialization properties

  // Long-running Keeper shell process
  private persistentProcess: ChildProcess | null = null;
  // Event emitter for process communication
  private processEmitter = new EventEmitter();
  // Queue of pending commands to execute
  private commandQueue: Array<{
    id: string;
    command: string;
    args: string[];
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;
  // Track if we've ever initialized
  private isInitialized = false;
  // Flag to switch to persistent mode
  private usePersistentProcess = false;

  private shellReady = false;
  private shellReadyPromise: Promise<void> | null = null;


  public constructor(
    // @ts-ignore
    private context: ExtensionContext,
    private spinner: StatusBarSpinner
  ) { }

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

  // Check if Keeper Commander CLI is installed by running --version
  private async checkCommanderInstallation(): Promise<boolean> {
    try {
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
     * TODO: IN FUTURE WE WILL NOT USE this-device command, WILL USE 'whoami' command instead
     */
    try {
      // Create timeout promise to prevent hanging on interactive login prompts
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Must be asking for interactive login')),
          30000 // 30 second timeout for auth check
        );
      });

      // Create execution promise for the actual auth check
      const execPromise = this.executeCommanderCommandLegacyRaw('this-device');

      // Race between execution and timeout to prevent hanging
      const { stdout, stderr } = await Promise.race([
        execPromise,
        timeoutPromise,
      ]);

      const out = `${stdout}\n${stderr}`;
      const persistentOn = /Persistent Login:\s*ON/i.test(out);

      // Look for biometric authentication hints in output
      const biometricHints = [
        /Press Ctrl\+C to skip biometric/i,
        /Attempting biometric authentication/i,
        /Successfully authenticated with Biometric Login/i,
        /Syncing\.\.\./i,
        /Decrypted\s*\[\d+\]\s*record\(s\)/i,
      ];
      const biometricDetected = biometricHints.some((rx) => rx.test(out));

      if (persistentOn || biometricDetected) {
        const mode = persistentOn ? 'Persistent' : 'Biometric';
        logger.logInfo(`Keeper Commander CLI Authenticated: YES (${mode})`);
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

  // add a raw executor (no cleaning)
  private async executeCommanderCommandLegacyRaw(
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `keeper ${command} ${args.join(' ')}`;
    const { stdout, stderr } = await promisifyExec(exec)(fullCommand);
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

  // Main command execution method with lazy initialization
  public async executeCommanderCommand(
    command: string,
    args: string[] = []
  ): Promise<string> {
    logger.logDebug(
      `CliService.executeCommanderCommand called: ${command} with ${args.length} arguments`
    );

    // Initialize on first use
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    // If initialization failed or persistent process is disabled, use legacy method
    if (!this.usePersistentProcess) {
      logger.logInfo(`Using legacy mode for command: ${command}`);
      return this.executeCommanderCommandLegacy(command, args);
    }

    // Use persistent process for subsequent commands (more efficient)
    try {
      return await this.executeCommanderCommandPersistent(command, args);
    } catch (error) {
      logger.logError(
        `Persistent process failed, falling back to legacy mode:`,
        error
      );

      // Disable persistent mode on failure
      this.usePersistentProcess = false;

      // Fallback to legacy
      return this.executeCommanderCommandLegacy(command, args);
    }
  }

  // Execute command using persistent Keeper shell process
  private async executeCommanderCommandPersistent(
    command: string,
    args: string[] = []
  ): Promise<string> {
    // Ensure shell process is ready
    await this.ensurePersistentProcess();

    return new Promise((resolve, reject) => {
      // Generate unique command ID
      const commandId = Math.random().toString(36).substr(2, 9);

      this.commandQueue.push({
        id: commandId,
        command,
        args,
        resolve,
        reject,
      });

      // Start processing the queue
      this.processNextCommand();
    });
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
      logger.logInfo('Creating persistent Keeper Commander process...');

      this.shellReady = false;
      this.shellReadyPromise = null;

      // Use platform-aware spawning
      if (process.platform === 'win32') {
        // On Windows, use CMD to handle the 'keeper' alias
        logger.logDebug('Using Windows CMD wrapper for keeper command');
        this.persistentProcess = spawn('cmd', ['/c', 'keeper', 'shell'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
      } else {
        // On other platforms, spawn directly
        logger.logDebug('Using direct spawn for keeper command');
        this.persistentProcess = spawn('keeper', ['shell'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
      }

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
        if (data.includes('My Vault>') || data.includes('$')) {
          // Remove startup listener
          this.persistentProcess?.stdout?.off('data', onStdoutStartup);

          // After ready, attach the real forwarders for command execution
          this.persistentProcess?.stdout?.on('data', (d) => {
            // Forward stdout to command handlers
            this.processEmitter.emit('stdout', d.toString());
          });
          this.persistentProcess?.stderr?.on('data', (d) => {
            // Forward stderr to command handlers
            this.processEmitter.emit('stderr', d.toString());
          });

          // Mark shell as ready for commands
          this.shellReady = true;
        }
      };
      this.persistentProcess.stdout?.on('data', onStdoutStartup);

      // readiness promise with timeout
      this.shellReadyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Shell ready timeout')),
          60000
        );
        const onReady = (chunk: Buffer): void => {
          const data = chunk.toString();
          if (data.includes('My Vault>') || data.includes('$')) {
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

  private async processNextCommand(): Promise<void> {
    if (this.isProcessing || this.commandQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const commandItem = this.commandQueue.shift();
    if (!commandItem) {
      return;
    }

    const { command, args, resolve, reject } = commandItem;

    try {
      const result = await this.executeCommandInProcess(command, args);
      resolve(result);
    } catch (error) {
      reject(error as Error);
    } finally {
      this.isProcessing = false;
      // Process next command
      this.processNextCommand();
    }
  }

  private async executeCommandInProcess(
    command: string,
    args: string[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command execution timeout'));
      }, 60000);

      // Accumulate stdout for command result
      let output = '';
      // Accumulate stderr for error detection
      let errorOutput = '';
      // Track if we've handled biometric prompt
      let biometricPromptHandled = false;

      // Handle stdout data from Keeper process
      const onStdout = (data: string): void => {
        const dataStr = data.toString();

        // Handle biometric authentication prompts automatically
        if (dataStr.includes('Press Ctrl+C to skip biometric')) {
          if (!biometricPromptHandled) {
            biometricPromptHandled = true;
            logger.logInfo(
              'Biometric prompt detected, sending Ctrl+C to skip...'
            );

            // Send Ctrl+C to skip biometric authentication
            this.persistentProcess?.stdin?.write('\x03');

            // Wait and re-send the original command after skipping biometric
            setTimeout(() => {
              this.persistentProcess?.stdin?.write(
                `${command} ${args.join(' ')}\n`
              );
            }, 500);

            return;
          }
        }

        // Check for authentication expiration in stdout
        if (dataStr.includes('Not logged in')) {
          logger.logError('Keeper shell session expired - user not logged in');
          cleanup();

          // Reset authentication state and persistent process
          this.isAuthenticated = false;
          this.usePersistentProcess = false;
          this.isInitialized = false;

          // Kill the expired process to prevent further issues
          if (this.persistentProcess) {
            this.persistentProcess.kill();
            this.persistentProcess = null;
          }

          // Clear command queue and reject all pending commands
          this.commandQueue.forEach(({ reject }) => {
            reject(new Error('Authentication expired'));
          });
          this.commandQueue = [];
          this.isProcessing = false;

          // Show authentication error to user
          this.promptManualAuthenticationError();

          reject(new Error('Authentication expired. Please log in again.'));
          return;
        }

        // Add to output if not biometric prompt (normal command output)
        if (!dataStr.includes('Press Ctrl+C to skip biometric')) {
          output += dataStr;
        }
      };

      // Handle stderr data from Keeper process
      const onStderr = (data: string): void => {
        const dataStr = data.toString();

        // Check for "Not logged in" in stderr as well (same as stdout)
        if (dataStr.includes('Not logged in')) {
          logger.logError(
            'Keeper shell session expired - user not logged in (stderr)'
          );
          cleanup();

          // Reset authentication state and persistent process
          this.isAuthenticated = false;
          this.usePersistentProcess = false;
          this.isInitialized = false;

          // Kill the expired process to prevent further issues
          if (this.persistentProcess) {
            this.persistentProcess.kill();
            this.persistentProcess = null;
          }

          // Clear command queue and reject all pending commands
          this.commandQueue.forEach(({ reject }) => {
            reject(new Error('Authentication expired'));
          });
          this.commandQueue = [];
          this.isProcessing = false;

          // Show authentication error to user
          this.promptManualAuthenticationError();

          reject(new Error('Authentication expired. Please log in again.'));
          return;
        }

        // accumulate stderr output; will be cleaned and analyzed at the end
        errorOutput += dataStr;
      };

      // Clean up event listeners and timeouts
      const cleanup = (): void => {
        // Clear the main command timeout
        clearTimeout(timeout);

        // Remove stdout listener
        this.processEmitter.removeListener('stdout', onStdout);
        // Remove stderr listener
        this.processEmitter.removeListener('stderr', onStderr);
      };

      // Listen for stdout events
      this.processEmitter.on('stdout', onStdout);
      // Listen for stderr events
      this.processEmitter.on('stderr', onStderr);

      // Send command to Keeper Commander process via stdin
      this.persistentProcess?.stdin?.write(`${command} ${args.join(' ')}\n`);

      // Wait for command completion by checking for shell prompt
      const checkCompletion = (): void => {
        // Check for shell prompt
        if (output.includes('My Vault>') || output.includes('$')) {
          // Clean up listeners and timeouts
          cleanup();

          // Remove the shell prompt from output
          let combinedOut = output.replace(/My Vault>.*$/s, '').trim();

          // Remove the echoed command from output (what we sent)
          const commandToRemove = `${command} ${args.join(' ')}`;
          combinedOut = combinedOut.replace(
            new RegExp(`${commandToRemove}\\s*`, 'g'),
            ''
          );

          // Clean benign noise from both stdout and stderr streams
          const cleanOut = cleanCommanderNoise(combinedOut);
          const cleanErr = cleanCommanderNoise(errorOutput);

          // Check if stderr contains real errors
          if (isRealError(cleanErr)) {
            // Reject with error message
            reject(new Error(cleanErr));
          } else {
            // Resolve with cleaned output
            resolve(cleanOut || combinedOut);
          }
        } else {
          // Check again in 100ms if no prompt yet
          setTimeout(checkCompletion, 100);
        }
      };

      // Start checking for completion
      checkCompletion();
    });
  }

  // Handle errors in the persistent process
  private handleProcessError(): void {
    // Clear the failed process
    this.persistentProcess = null;

    // Reject all pending commands in the queue
    this.commandQueue.forEach(({ reject }) => {
      reject(new Error('Process error occurred'));
    });
    // Clear the command queue
    this.commandQueue = [];
    // Allow new commands to be processed
    this.isProcessing = false;
  }

  // Handle unexpected process exit
  private handleProcessExit(): void {
    // Clear the exited process
    this.persistentProcess = null;

    // Reject all pending commands in the queue
    this.commandQueue.forEach(({ reject }) => {
      reject(new Error('Process exited'));
    });

    // Clear the command queue
    this.commandQueue = [];
    // Allow new commands to be processed
    this.isProcessing = false;
  }

  // Show user-friendly error when Keeper Commander is not installed
  private async promptCommanderInstallationError(): Promise<void> {
    const action = await window.showErrorMessage(
      HELPER_MESSAGES.CLI_NOT_INSTALLED,
      HELPER_MESSAGES.OPEN_INSTALLATION_DOCS
    );

    if (action === HELPER_MESSAGES.OPEN_INSTALLATION_DOCS) {
      const docsUrl = Uri.parse(KEEPER_COMMANDER_DOCS_URLS.INSTALLATION);
      // Open installation documentation
      env.openExternal(docsUrl);
    }
  }

  // Show user-friendly error when authentication fails
  private async promptManualAuthenticationError(): Promise<void> {
    const action = await window.showErrorMessage(
      HELPER_MESSAGES.CLI_NOT_AUTHENTICATED,
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

  public dispose(): void {
    if (this.persistentProcess) {
      this.persistentProcess.kill();
      this.persistentProcess = null;
    }
    this.commandQueue = [];
    this.isProcessing = false;
  }
}
