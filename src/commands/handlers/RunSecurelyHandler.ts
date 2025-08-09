import { window, workspace } from "vscode";
import { BaseCommandHandler } from "./BaseCommandHandler";
import { KEEPER_NOTATION_FIELD_TYPES } from "../../utils/constants";
import { parseKeeperReference, validateKeeperReference } from "../../utils/helper";
import { logger } from "../../utils/logger";
import { FieldExtractor } from "../utils/FieldExtractor";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export class RunSecurelyHandler extends BaseCommandHandler {
    async execute(): Promise<void> {
        if (!await this.canExecute()) {
            return;
        }

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                window.showErrorMessage('Open a folder/workspace first');
                return;
            }
            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Read .env file
            const envPath = path.join(workspaceRoot, '.env');
            if (!fs.existsSync(envPath)) {
                window.showErrorMessage('.env file not found in workspace root');
                return;
            }

            // Prompt user for command to run
            const command = await window.showInputBox({
                prompt: 'Enter command to run with Keeper secrets injected',
                placeHolder: 'e.g. node index.js',
            });

            if (!command) {
                window.showWarningMessage('No command entered. Aborted.');
                return;
            }

            this.spinner.show("Resolving secrets...");

            const envFileContent = fs.readFileSync(envPath, 'utf8');
            const envConfig = dotenv.parse(envFileContent);

            // Group references by recordUid for batch processing
            const recordGroups = new Map<string, Array<{
                key: string;
                fieldType: KEEPER_NOTATION_FIELD_TYPES;
                itemName: string;
            }>>();

            // Parse all references first
            for (const [key, value] of Object.entries(envConfig)) {
                if (validateKeeperReference(value)) {
                    const parsedRef = parseKeeperReference(value);
                    if (!parsedRef) {
                        logger.logError(`Failed to parse keeper:// reference: ${value}`);
                        continue;
                    }

                    const { recordUid, fieldType, itemName } = parsedRef;

                    if (!recordGroups.has(recordUid)) {
                        recordGroups.set(recordUid, []);
                    }
                    recordGroups.get(recordUid)!.push({ key, fieldType, itemName });
                }
            }

            // Process records in parallel
            const resolvedEnv: Record<string, string> = {};

            if (recordGroups.size > 0) {
                const promises = Array.from(recordGroups.entries()).map(async ([recordUid, references]) => {
                    logger.logInfo(`Fetching record: ${recordUid} with ${references.length} references`);

                    try {
                        // Single CLI call for each record
                        const record = await this.cliService.executeCommanderCommand('get', [recordUid, '--format=json']);
                        const recordDetails = JSON.parse(record);

                        // Process all references for this record
                        references.forEach(({ key, fieldType, itemName }) => {
                            const value = FieldExtractor.extractFieldValue(recordDetails, fieldType, itemName);
                            if (value !== null) {
                                resolvedEnv[key] = value;
                                logger.logInfo(`Resolved ${key}`);
                            } else {
                                logger.logError(`Failed to resolve keeper reference: keeper://${recordUid}/${fieldType}/${itemName}`);
                                resolvedEnv[key] = `keeper://${recordUid}/${fieldType}/${itemName}`;
                            }
                        });
                    } catch (error) {
                        logger.logError(`Failed to fetch record ${recordUid}:`, error);
                        // Mark all references for this record as failed
                        references.forEach(({ key }) => {
                            resolvedEnv[key] = `keeper://${recordUid}/error/failed_to_fetch`;
                        });
                    } finally {
                        this.spinner.hide();
                    }
                });

                // Execute all record fetches in parallel
                await Promise.all(promises);
            }

            // Add non-keeper references
            for (const [key, value] of Object.entries(envConfig)) {
                if (!validateKeeperReference(value)) {
                    resolvedEnv[key] = value;
                }
            }

            logger.logInfo(`Resolved ${Object.keys(resolvedEnv).length} environment variables`);

            // Create a new terminal with injected env vars
            const terminal = window.createTerminal({
                name: 'Keeper Secure Run',
                env: {
                    ...process.env,
                    ...resolvedEnv,
                },
            });

            terminal.show();
            terminal.sendText(command, true);

            window.showInformationMessage(`Command started with secrets injected`);

        } catch (error: any) {
            window.showErrorMessage(`Failed to run securely: ${error.message}`);
        } finally {
            this.spinner.hide();
        }
    }
} 