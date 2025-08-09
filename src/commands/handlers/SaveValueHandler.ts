import { window, ExtensionContext } from "vscode";
import { CliService } from "../../services/cli";
import { StatusBarSpinner } from "../../utils/helper";
import { BaseCommandHandler } from "./BaseCommandHandler";
import { KEEPER_NOTATION_FIELD_TYPES, KEEPER_RECORD_TYPES } from "../../utils/constants";
import { createKeeperReference } from "../../utils/helper";
import { logger } from "../../utils/logger";
import { COMMANDS } from "../../utils/constants";
import { CommandUtils } from "../utils/CommandUtils";
import { StorageManager } from "../storage/StorageManager";
import * as vscode from 'vscode';
import { workspace } from "vscode";
import { languages } from "vscode";

export class SaveValueHandler extends BaseCommandHandler {
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

    async execute(secretValue?: string, range?: vscode.Range, documentUri?: vscode.Uri): Promise<void> {
        if (!await this.canExecute()) {
            return;
        }

        try {
            let selectedText: string | undefined;
            let editor = window.activeTextEditor;

            // If called from CodeLens, use provided values
            if (secretValue && range && documentUri) {
                selectedText = secretValue;
                // Open the document if not already active
                if (editor?.document.uri.toString() !== documentUri.toString()) {
                    const document = await workspace.openTextDocument(documentUri);
                    editor = await window.showTextDocument(document);
                }
                
                // Set the selection to the detected range
                if (editor) {
                    editor.selection = new vscode.Selection(range.start, range.end);
                }
            } else {
                // Manual selection mode
                selectedText = editor?.document.getText(editor?.selection);
                if (!selectedText) {
                    window.showErrorMessage("Please make a selection to save its value.");
                    return;
                }
            }

            // Validate that we have text to save
            if (!selectedText) {
                window.showErrorMessage("No secret value found to save.");
                return;
            }

            // Get secret name from user
            const recordName = await CommandUtils.getSecretNameFromUser(COMMANDS.SAVE_VALUE_TO_VAULT);

            const recordFieldName = await CommandUtils.getSecretFieldNameFromUser(COMMANDS.SAVE_VALUE_TO_VAULT);

            await this.storageManager.ensureValidStorage();

            this.spinner.show("Saving secret to keeper vault...");

            let recordUid: string;
            const currentStorage = this.storageManager.getCurrentStorage();

            /**
             * 
             * [<FIELD_SET>][<FIELD_TYPE>][<FIELD_LABEL>]=[FIELD_VALUE]
             * 
             * `"c.${CommandUtils.getFieldType(recordFieldName)}.${recordFieldName}"="${selectedText}"`
             * 
             * Create custom field with detect recordFieldName that can be secret or text 
             */

            const args = [
                `--title="${recordName}"`,
               `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
                `"c.${CommandUtils.getFieldType(recordFieldName)}.${recordFieldName}"="${selectedText}"`
            ];

            // if currentStorage is not "My Vault", then add folder to args
            if (currentStorage?.folderUid !== "/") {
                args.push(`--folder="${currentStorage?.folderUid}"`);
            }

            recordUid = await this.cliService.executeCommanderCommand('record-add', args);

            // Create a Keeper Notation reference for the secret
            const recordRef = createKeeperReference(recordUid.trim(), KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD, recordFieldName);
            if (!recordRef) {
                logger.logError(`${COMMANDS.SAVE_VALUE_TO_VAULT}: Failed to create keeper reference for secret: ${recordName}`);
                throw new Error("Something went wrong while generating a password! Please try again.");
            }

            // Insert the Keeper Notation reference
            if (editor) {
                await editor.edit(editBuilder => {
                    if (range) {
                        // Replace the detected secret range
                        editBuilder.replace(range, recordRef);
                    } else {
                        // Replace the current selection
                        editBuilder.replace(editor.selection, recordRef);
                    }
                });
            }

            window.showInformationMessage(`Secret saved to keeper vault at "${currentStorage?.name}" folder successfully!`);
        } catch (error: any) {
            window.showErrorMessage(`Failed to save secret: ${error.message}`);
        } finally {
            this.spinner.hide();
        }
    }
} 