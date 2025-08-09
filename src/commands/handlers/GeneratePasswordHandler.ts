import { window, ExtensionContext } from "vscode";
import { CliService } from "../../services/cli";
import { StatusBarSpinner } from "../../utils/helper";
import { BaseCommandHandler } from "./BaseCommandHandler";
import { KEEPER_FIELD_TYPES, KEEPER_NOTATION_FIELD_TYPES, KEEPER_RECORD_TYPES } from "../../utils/constants";
import { createKeeperReference } from "../../utils/helper";
import { logger } from "../../utils/logger";
import { COMMANDS } from "../../utils/constants";
import { CommandUtils } from "../utils/CommandUtils";
import { StorageManager } from "../storage/StorageManager";

export class GeneratePasswordHandler extends BaseCommandHandler {
    private storageManager: StorageManager;

    constructor(
        cliService: CliService,
        context: ExtensionContext,
        spinner: StatusBarSpinner,
        storageManager: StorageManager
    ) {
        super(cliService, context, spinner);
        this.storageManager = storageManager;
    }

    async execute(): Promise<void> {
        if (!await this.canExecute()) {
            return;
        }

        try {
            // Get secret name from user
            const recordName = await CommandUtils.getSecretNameFromUser(COMMANDS.GENERATE_PASSWORD);
            const recordFieldName = await CommandUtils.getSecretFieldNameFromUser(COMMANDS.GENERATE_PASSWORD);

            await this.storageManager.ensureValidStorage();

            this.spinner.show("Generating password...");

            // Generate a random password
            const password = await this.cliService.executeCommanderCommand('generate', ['-q', '-nb']);
            if (!password) {
                logger.logError(`${COMMANDS.GENERATE_PASSWORD}: Failed to generate a password.`);
                throw new Error("Something went wrong while generating a password! Please try again.");
            }

            let recordUid: string;
            const currentStorage = this.storageManager.getCurrentStorage();

            const args = [
                `--title="${recordName}"`,
                `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
                `"c.${KEEPER_FIELD_TYPES.SECRET}.${recordFieldName}"="${password}"`
            ];

            // if currentStorage is not "My Vault", then add folder to args
            if (currentStorage?.folderUid !== "/") {
                args.push(`--folder="${currentStorage?.folderUid}"`);
            }

            recordUid = await this.cliService.executeCommanderCommand('record-add', args);

            // Create a Keeper Notation reference for the password
            const recordRef = createKeeperReference(recordUid.trim(), KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD, recordFieldName);
            if (!recordRef) {
                logger.logError(`${COMMANDS.GENERATE_PASSWORD}: Failed to create keeper reference for secret: ${recordName}`);
                throw new Error("Something went wrong while generating a password! Please try again.");
            }

            // Insert the Keeper Notation reference at the cursor position
            const editor = window.activeTextEditor;
            if (editor) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, recordRef);
                });
            }

            window.showInformationMessage(`Password generated and saved to keeper vault at "${currentStorage?.name}" folder successfully!`);
        } catch (error: any) {
            window.showErrorMessage(`Failed to generate password: ${error.message}`);
        } finally {
            this.spinner.hide();
        }
    }
} 