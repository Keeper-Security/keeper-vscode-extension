import { env, ExtensionContext, Uri, window } from "vscode";
import { logger } from "../utils/logger";
import { promisifyExec, StatusBarSpinner } from "../utils/helper";
import { exec, spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { KEEPER_COMMANDER_DOCS_URLS } from "../utils/constants";
import { HELPER_MESSAGES } from "../utils/constants";

const BENIGN_PATTERNS = [
    /Logging in to Keeper Commander/i,
    /Attempting biometric authentication/i,
    /Successfully authenticated with Biometric Login/i,
    /Press Ctrl\+C to skip biometric/i,
    /and use default login method/i,
    /Syncing\.\.\./i,
    /Decrypted\s*\[\d+\]\s*record\(s\)/i,
    /keeper shell/i,
    /^\r$/ // stray carriage returns
];

function cleanCommanderNoise(text: string): string {
    if (!text) { return ''; }
    let out = text;
    for (const rx of BENIGN_PATTERNS) {
        out = out.replace(new RegExp(rx.source + '.*?(\\n|$)', 'gim'), '');
    }
    return out.trim();
}

function isRealError(text: string): boolean {
    const t = text.trim();
    if (!t) { return false; }
    // if only benign lines remain, treat as non-error
    const cleaned = cleanCommanderNoise(t);
    if (!cleaned) { return false; }
    // conservative error keywords
    return /(error|failed|exception|traceback)/i.test(cleaned);
}

export class CliService {
    private isInstalled: boolean = false;
    private isAuthenticated: boolean = false;

    // Lazy initialization properties
    private persistentProcess: ChildProcess | null = null;
    private processEmitter = new EventEmitter();
    private commandQueue: Array<{
        id: string;
        command: string;
        args: string[];
        resolve: (value: string) => void;
        reject: (error: Error) => void;
    }> = [];
    private isProcessing = false;
    private isInitialized = false; // Track if we've ever initialized
    private usePersistentProcess = false; // Flag to switch to persistent mode

    private shellReady = false;
    private shellReadyPromise: Promise<void> | null = null;

    public constructor(private context: ExtensionContext, private spinner: StatusBarSpinner) { }

    // Lazy initialization method
    private async lazyInitialize(): Promise<void> {
        if (this.isInitialized) {
            logger.logDebug("CliService.lazyInitialize: Already initialized, skipping");
            return;
        }

        try {
            logger.logDebug("CliService.lazyInitialize: Starting initialization");
            this.spinner.show("Initializing Keeper Security Extension...");

            // Check both installation and authentication concurrently
            logger.logDebug("CliService.lazyInitialize: Checking commander installation and authentication");
            const [isInstalled, isAuthenticated] = await Promise.all([
                this.checkCommanderInstallation(),
                this.checkCommanderAuth()
            ]);

            this.isInstalled = isInstalled;
            this.isAuthenticated = isAuthenticated;
            logger.logDebug(`CliService.lazyInitialize: Installation check: ${isInstalled}, Authentication check: ${isAuthenticated}`);

            if (!isInstalled) {
                logger.logError("Keeper Commander CLI is not installed");
                this.spinner.hide();
                await this.promptCommanderInstallationError();
                return;
            }

            if (!isAuthenticated) {
                logger.logError("Keeper Commander CLI is not authenticated");
                this.spinner.hide();
                await this.promptManualAuthenticationError();
                return;
            }

            // After successful auth check, switch to persistent process mode
            logger.logDebug("CliService.lazyInitialize: Switching to persistent process mode");
            this.usePersistentProcess = true;
            this.isInitialized = true;

            logger.logInfo("Keeper Security Extension initialized successfully");

        } catch (error) {
            logger.logError("Failed to initialize Keeper Security Extension status", error);
            this.isInstalled = false;
            this.isAuthenticated = false;
        } finally {
            this.spinner.hide();
        }
    }

    private async checkCommanderInstallation(): Promise<boolean> {
        try {
            // Use the legacy method for initial checks
            const stdout = await this.executeCommanderCommandLegacy('--version');

            const isInstalled = stdout.includes('version');
            logger.logInfo(`Keeper Commander CLI Installed: YES`);

            return isInstalled;
        } catch (error: any) {
            logger.logError("Keeper Commander CLI Installation check failed:", error.message || error);
            return false;
        }
    }

    private async checkCommanderAuth(): Promise<boolean> {
        /**
         * TODO: IN FUTURE WE WILL NOT USE this-device command, WILL USE 'whoami' command instead
         */
        try {
            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Must be asking for interactive login')), 15000);
            });
            
            // Create execution promise
            const execPromise = this.executeCommanderCommandLegacyRaw('this-device');
            
            // Race between execution and timeout
            const { stdout, stderr } = await Promise.race([execPromise, timeoutPromise]);

            const out = `${stdout}\n${stderr}`;
            const persistentOn = /Persistent Login:\s*ON/i.test(out);

            const biometricHints = [
                /Press Ctrl\+C to skip biometric/i,
                /Attempting biometric authentication/i,
                /Successfully authenticated with Biometric Login/i,
                /Syncing\.\.\./i,
                /Decrypted\s*\[\d+\]\s*record\(s\)/i
            ];
            const biometricDetected = biometricHints.some(rx => rx.test(out));

            if (persistentOn || biometricDetected) {
                const mode = persistentOn ? 'Persistent' : 'Biometric';
                logger.logInfo(`Keeper Commander CLI Authenticated: YES (${mode})`);
                return true;
            }

            logger.logInfo('Keeper Commander CLI Authenticated: NO');
            return false;

        } catch (error: any) { 
            logger.logError("Keeper Commander CLI Authentication check failed:", error?.message || error);
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
    private async executeCommanderCommandLegacy(command: string, args: string[] = []): Promise<string> {
        try {
            const { stdout, stderr } = await this.executeCommanderCommandLegacyRaw(command, args);
            const cleanStdout = cleanCommanderNoise(stdout);
            const cleanStderr = cleanCommanderNoise(stderr);
            if (isRealError(cleanStderr)) { throw new Error(cleanStderr); }
            return cleanStdout || stdout;
        } catch (error) {
            logger.logError(`Legacy commander command failed`, error);
            throw error;
        }
    }

    // Main command execution method with lazy initialization
    public async executeCommanderCommand(command: string, args: string[] = []): Promise<string> {
        logger.logDebug(`CliService.executeCommanderCommand called: ${command} with ${args.length} arguments`);
        
        if (!this.isInitialized) {
            await this.lazyInitialize();
        }

        // If initialization failed or persistent process is disabled, use legacy method
        if (!this.usePersistentProcess) {
            logger.logInfo(`Using legacy mode for command: ${command}`);
            return this.executeCommanderCommandLegacy(command, args);
        }

        // Use persistent process for subsequent commands
        try {
            return await this.executeCommanderCommandPersistent(command, args);
        } catch (error) {
            logger.logError(`Persistent process failed, falling back to legacy mode:`, error);
            this.usePersistentProcess = false;
            return this.executeCommanderCommandLegacy(command, args);
        }
    }

    // Persistent process command execution
    private async executeCommanderCommandPersistent(command: string, args: string[] = []): Promise<string> {
        await this.ensurePersistentProcess();

        return new Promise((resolve, reject) => {
            const commandId = Math.random().toString(36).substr(2, 9);

            this.commandQueue.push({
                id: commandId,
                command,
                args,
                resolve,
                reject
            });

            this.processNextCommand();
        });
    }

    // ensurePersistentProcess: await readiness even if process exists
    private async ensurePersistentProcess(): Promise<void> {
        if (!this.persistentProcess || this.persistentProcess.killed) {
            await this.createPersistentProcess();
        }
        if (!this.shellReady && this.shellReadyPromise) {
            await this.shellReadyPromise; // gate all commands until prompt
        }
    }

    // createPersistentProcess: don't forward stdout/stderr until ready
    private async createPersistentProcess(): Promise<void> {
        try {
            logger.logInfo("Creating persistent Keeper Commander process...");

            this.shellReady = false;
            this.shellReadyPromise = null;

            this.persistentProcess = spawn('keeper', ['shell'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            });

            this.persistentProcess.on('error', (error) => {
                logger.logError('Persistent process error:', error);
                this.handleProcessError();
            });

            this.persistentProcess.on('exit', (code) => {
                logger.logInfo(`Persistent process exited with code: ${code}`);
                this.handleProcessExit();
            });

            // TEMP listeners: consume startup noise only for readiness detection
            const onStdoutStartup = (chunk: Buffer) => {
                const data = chunk.toString();
                if (data.includes('My Vault>') || data.includes('$')) {
                    this.persistentProcess?.stdout?.off('data', onStdoutStartup);
                    // after ready, attach the real forwarders
                    this.persistentProcess?.stdout?.on('data', (d) => {
                        this.processEmitter.emit('stdout', d.toString());
                    });
                    this.persistentProcess?.stderr?.on('data', (d) => {
                        this.processEmitter.emit('stderr', d.toString());
                    });
                    this.shellReady = true;
                    // resolve shellReadyPromise if used
                }
            };
            this.persistentProcess.stdout?.on('data', onStdoutStartup);

            // readiness promise with timeout
            this.shellReadyPromise = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Shell ready timeout')), 60000);
                const onReady = (chunk: Buffer) => {
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
            logger.logInfo("Persistent Keeper Commander process ready");

        } catch (error) {
            logger.logError('Failed to create persistent process:', error);
            throw error;
        }
    }

    private async waitForShellReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Shell ready timeout'));
            }, 60000);

            const onData = (data: string) => {
                if (data.includes('My Vault>') || data.includes('$')) {
                    clearTimeout(timeout);
                    this.processEmitter.removeListener('stdout', onData);
                    resolve();
                }
            };

            this.processEmitter.on('stdout', onData);
        });
    }

    private async processNextCommand(): Promise<void> {
        if (this.isProcessing || this.commandQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const { id, command, args, resolve, reject } = this.commandQueue.shift()!;

        try {
            const result = await this.executeCommandInProcess(command, args);
            resolve(result);
        } catch (error) {
            reject(error as Error);
        } finally {
            this.isProcessing = false;
            this.processNextCommand(); // Process next command
        }
    }

    private async executeCommandInProcess(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Command execution timeout'));
            }, 30000);

            let output = '';
            let errorOutput = '';
            let biometricPromptHandled = false;

            const onStdout = (data: string) => {
                const dataStr = data.toString();

                // Handle biometric prompt
                if (dataStr.includes('Press Ctrl+C to skip biometric')) {
                    if (!biometricPromptHandled) {
                        biometricPromptHandled = true;
                        logger.logInfo("Biometric prompt detected, sending Ctrl+C to skip...");

                        // Send Ctrl+C to skip biometric
                        this.persistentProcess?.stdin?.write('\x03');

                        // Wait and re-send command
                        setTimeout(() => {
                            this.persistentProcess?.stdin?.write(`${command} ${args.join(' ')}\n`);
                        }, 500);

                        return;
                    }
                }

                // Add to output if not biometric prompt
                if (!dataStr.includes('Press Ctrl+C to skip biometric')) {
                    output += dataStr;
                }
            };

            const onStderr = (data: string) => {
                const dataStr = data.toString();
                // accumulate; will be cleaned at the end
                errorOutput += dataStr;
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.processEmitter.removeListener('stdout', onStdout);
                this.processEmitter.removeListener('stderr', onStderr);
            };

            this.processEmitter.on('stdout', onStdout);
            this.processEmitter.on('stderr', onStderr);

            // Send command to process
            this.persistentProcess?.stdin?.write(`${command} ${args.join(' ')}\n`);

            // Wait for command completion
            const checkCompletion = () => {
                if (output.includes('My Vault>') || output.includes('$')) {
                    cleanup();

                    // remove prompt tail
                    let combinedOut = output.replace(/My Vault>.*$/s, '').trim();

                    // remove the echoed command
                    const commandToRemove = `${command} ${args.join(' ')}`;
                    combinedOut = combinedOut.replace(new RegExp(`${commandToRemove}\\s*`, 'g'), '');

                    // clean benign noise from both streams
                    const cleanOut = cleanCommanderNoise(combinedOut);
                    const cleanErr = cleanCommanderNoise(errorOutput);

                    if (isRealError(cleanErr)) {
                        reject(new Error(cleanErr));
                    } else {
                        resolve(cleanOut || combinedOut);
                    }
                } else {
                    setTimeout(checkCompletion, 100);
                }
            };

            checkCompletion();
        });
    }

    private handleProcessError(): void {
        this.persistentProcess = null;
        // Reject all pending commands
        this.commandQueue.forEach(({ reject }) => {
            reject(new Error('Process error occurred'));
        });
        this.commandQueue = [];
        this.isProcessing = false;
    }

    private handleProcessExit(): void {
        this.persistentProcess = null;
        // Reject all pending commands
        this.commandQueue.forEach(({ reject }) => {
            reject(new Error('Process exited'));
        });
        this.commandQueue = [];
        this.isProcessing = false;
    }

    private async promptCommanderInstallationError(): Promise<void> {
        const action = await window.showErrorMessage(
            HELPER_MESSAGES.CLI_NOT_INSTALLED,
            HELPER_MESSAGES.OPEN_INSTALLATION_DOCS,
        );

        if (action === HELPER_MESSAGES.OPEN_INSTALLATION_DOCS) {
            const docsUrl = Uri.parse(KEEPER_COMMANDER_DOCS_URLS.INSTALLATION);
            env.openExternal(docsUrl);
        }
    }

    private async promptManualAuthenticationError(): Promise<void> {
        const action = await window.showErrorMessage(
            HELPER_MESSAGES.CLI_NOT_AUTHENTICATED,
            HELPER_MESSAGES.OPEN_AUTHENTICATION_DOCS
        );

        if (action === HELPER_MESSAGES.OPEN_AUTHENTICATION_DOCS) {
            const docsUrl = Uri.parse(KEEPER_COMMANDER_DOCS_URLS.AUTHENTICATION);
            env.openExternal(docsUrl);
        }
    }

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