import { window, ExtensionContext } from "vscode";
import { CliService } from "../../services/cli";
import { StatusBarSpinner } from "../../utils/helper";
import { BaseCommandHandler } from "./BaseCommandHandler";
import { KEEPER_NOTATION_FIELD_TYPES } from "../../utils/constants";
import { createKeeperReference } from "../../utils/helper";
import { logger } from "../../utils/logger";
import { COMMANDS } from "../../utils/constants";
import { IField } from "../../types";

export class GetValueHandler extends BaseCommandHandler {
    async execute(): Promise<void> {
        if (!await this.canExecute()) {
            return;
        }

        try {
            this.spinner.show("Retrieving secrets...");

            // List available records
            const records = await this.cliService.executeCommanderCommand('list', ['--format=json']);
            const recordsList = JSON.parse(records);

            this.spinner.hide();

            // Show picker for available records
            const selectedRecord: any = await window.showQuickPick(
                recordsList.map((r: any) => ({ label: r.title, value: r["record_uid"] })),
                { title: 'Available records from Keeper Vault', placeHolder: 'Select a record', ignoreFocusOut: true }
            );

            if (!selectedRecord) {
                return;
            }
            this.spinner.show("Retrieving secrets details...");

            // Get record details
            const recordDetails = await this.cliService.executeCommanderCommand('get', [selectedRecord.value, '--format=json']);
            const details = JSON.parse(recordDetails);

            this.spinner.hide();

            // Show field picker
            const fields = details["fields"].filter((field: IField) => field.value.length > 0).map((field: IField) => ({ label: field.label ?? field.type, value: field.label ?? field.type, fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD }));
            const customFields = details["custom"].filter((field: IField) => field.value.length > 0).map((field: IField) => ({ label: field.label ?? field.type, value: field.label ?? field.type, fieldType: KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD }));

            const fieldsToShow = [...fields, ...customFields];

            const selectedField = await window.showQuickPick(fieldsToShow, { title: `Available fields from record: ${selectedRecord.label}`, placeHolder: 'Which field do you want to retrieve?', ignoreFocusOut: true });

            if (!selectedField) {
                return;
            }

            const recordRef = createKeeperReference(selectedRecord.value.trim(), selectedField.fieldType, selectedField.label);
            if (!recordRef) {
                logger.logError(`${COMMANDS.GET_VALUE_FROM_VAULT}: Failed to create keeper reference for secret: ${selectedRecord.label}`);
                throw new Error("Something went wrong while generating a password! Please try again.");
            }

            // Insert the Keeper Notation reference at the cursor position
            const editor = window.activeTextEditor;
            if (editor) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, recordRef);
                });
            }

            window.showInformationMessage(`Reference of "${selectedField.label}" field of secret "${selectedRecord.label}" retrieved successfully!`);
        } catch (error: any) {
            window.showErrorMessage(`Failed to get value: ${error.message}`);
        } finally {
            this.spinner.hide();
        }
    }
} 