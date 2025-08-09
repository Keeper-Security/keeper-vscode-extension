import { env, ExtensionContext, Uri, window } from "vscode";
import { logger } from "../utils/logger";
import { promisifyExec, StatusBarSpinner } from "../utils/helper";
import { exec } from "child_process";
import { KEEPER_COMMANDER_DOCS_URLS } from "../utils/constants";
import { HELPER_MESSAGES } from "../utils/constants";

export class CliService {
    private isInstalled: boolean = false;
    private isAuthenticated: boolean = false;

    public constructor(private context: ExtensionContext, private spinner: StatusBarSpinner) {
        // this.context.subscriptions.push(
        //     commands.registerCommand(COMMANDS.AUTHENTICATE, async () => this.checkAuthenticationStatus())
        // );
        this.initializeStatus();
    }

    private async initializeStatus(): Promise<void> {
        try {
            this.spinner.show("Initializing Keeper Commander CLI status...");

            // Check both installation and authentication concurrently
            const [isInstalled, isAuthenticated] = await Promise.all([
                this.checkCommanderInstallation(),
                this.checkCommanderAuth()
            ]);

            this.isInstalled = isInstalled;
            this.isAuthenticated = isAuthenticated;

            if (!isInstalled) {
                logger.logError("Keeper Commander CLI is not installed");
                await this.promptCommanderInstallationError();
                return;
            }

            if (!isAuthenticated) {
                await this.promptManualAuthenticationError();
                return;
            }

            window.showInformationMessage("Keeper Security Extension is ready to use!");

        } catch (error) {
            logger.logError("Failed to initialize CLI status", error);
            this.isInstalled = false;
            this.isAuthenticated = false;
        } finally {
            this.spinner.hide();
        }
    }

    private async checkCommanderInstallation(): Promise<boolean> {
        try {
            const stdout = await this.executeCommanderCommand('--version');

            const isInstalled = stdout.includes('Keeper Commander');
            logger.logInfo(`Keeper Commander CLI Installed: YES`);

            return isInstalled;
        } catch (error: any) {
            logger.logError("Keeper Commander CLI Installation check failed:", error.message || error);
            return false;
        }
    }

    private async checkCommanderAuth(): Promise<boolean> {
        try {
            const stdout = await this.executeCommanderCommand('this-device');

            const authStatus = stdout.includes('Persistent Login: ON') ? true : false;
            logger.logInfo(`Keeper Commander CLI Authenticated: ${authStatus ? "YES" : "NO"}`);

            if (!authStatus) {
                throw new Error("Must be authenticated with Persistent Login or check network connection.");
            }

            return authStatus;
        } catch (error: any) {
            logger.logError("Keeper Commander CLI Authentication check failed:", error?.message || error);
            return false;
        }
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
        if (!this.isInstalled) {
            await this.promptCommanderInstallationError();
            return false;
        }

        if (!this.isAuthenticated) {
            await this.promptManualAuthenticationError();
            return false;
        }

        return true;
    }

    public async executeCommanderCommand(command: string, args: string[] = []): Promise<string> {
        try {
            const fullCommand = `keeper ${command} ${args.join(' ')}`;

            const { stdout, stderr } = await promisifyExec(exec)(fullCommand);

            if (stderr && stderr.trim().length > 0) {
                throw new Error(stderr);
            };

            return stdout;
        } catch (error) {
            logger.logError(`Commander command failed`, error);
            throw error;
        }
    }
}