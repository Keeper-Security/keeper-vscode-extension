import { ExtensionContext, Uri, window, workspace } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';
import {
  isEnvironmentFile,
  parseKeeperReference,
  validateKeeperReference,
} from '../../../utils/helper';
import path from 'path';
import fs from 'fs';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../utils/constants';
import { FieldExtractor } from '../../utils/fieldExtractor';
import dotenv from 'dotenv';
import { IRecordData } from '../../../types/ksm';

export abstract class BaseRunSecurelyHandler extends BaseCommandHandler {
  private static readonly LAST_COMMAND_KEY = 'lastRunSecurelyCommand';

  constructor(protected context: ExtensionContext) {
    super();
  }
  /**
   * Select workspace to run securely in
   */
  async selectWorkspace(): Promise<string | undefined> {
    logger.logDebug('Starting workspace selection');
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.logDebug('No workspace folders found');
      throw new Error('Open a folder/workspace first');
    }

    if (workspaceFolders.length === 1) {
      logger.logDebug(
        `Single workspace found - name: ${workspaceFolders[0].name}`
      );
      return workspaceFolders[0].uri.fsPath;
    }

    logger.logDebug(
      `Multiple workspaces found - count: ${workspaceFolders.length}`
    );

    const workspaceNames = workspaceFolders.map((folder) => folder.name);
    const selected = await window.showQuickPick(workspaceNames, {
      placeHolder: 'Select workspace to run securely in',
      matchOnDetail: true,
      ignoreFocusOut: true,
    });

    if (!selected) {
      logger.logDebug('User cancelled workspace selection');
      return;
    }

    const selectedWorkspace = workspaceFolders.find(
      (folder) => folder.name === selected
    );
    if (!selectedWorkspace) {
      logger.logDebug('User selected workspace not found');
      throw new Error('Workspace not found');
    }
    logger.logDebug(
      `User selected workspace - name: ${selectedWorkspace.name}`
    );
    return selectedWorkspace.uri.fsPath;
  }

  /**
   * Select environment file to use
   */
  protected async selectEnvironmentFile(
    workspaceRoot: string
  ): Promise<string | undefined> {
    const envFiles = this.findEnvironmentFiles(workspaceRoot);

    // Multiple files - let user choose
    const envFileNames = envFiles.map((file) =>
      path.relative(workspaceRoot, file)
    );
    const selected = await window.showQuickPick(
      ['Browse Environment File', ...envFileNames],
      {
        placeHolder: 'Select environment file to use',
        matchOnDetail: true,
        ignoreFocusOut: true,
      }
    );

    if (!selected) {
      //   throw new Error('No environment file selected');
      return;
    }

    if (selected === 'Browse Environment File') {
      // Open file picker to select .env.* files
      const fileUris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: Uri.file(workspaceRoot),
        openLabel: 'Select Environment File',
      });

      if (!fileUris || fileUris.length === 0) {
        // throw new Error('No environment file selected');
        return;
      }

      const selectedFilePath = fileUris[0].fsPath;
      const fileName = path.basename(selectedFilePath);

      if (isEnvironmentFile(fileName)) {
        return selectedFilePath;
      }

      throw new Error(
        'Selected file is not an environment file. Must be a .env or .env.* file'
      );
    }

    const selectedIndex = envFileNames.indexOf(selected);
    return envFiles[selectedIndex];
  }

  /**
   * Get command to run from user
   */
  protected async getCommandFromUser(): Promise<string | undefined> {
    const lastCommand = this.getLastCommand();

    const command = await window.showInputBox({
      prompt: 'Enter command to run with Keeper secrets injected',
      placeHolder: 'e.g. node index.js',
      value: lastCommand || '',
      ignoreFocusOut: true,
    });

    if (!command) {
      //   throw new Error(
      //     'No command entered. Please enter a command to run with Keeper secrets injected.'
      //   );
      return;
    }

    // Store the command for next time
    this.setLastCommand(command);

    return command;
  }

  /**
   * Get the last command that was used for run securely
   */
  protected getLastCommand(): string | undefined {
    return this.context.workspaceState.get(
      BaseRunSecurelyHandler.LAST_COMMAND_KEY
    );
  }

  /**
   * Store the command for future use
   */
  protected setLastCommand(command: string): void {
    this.context.workspaceState.update(
      BaseRunSecurelyHandler.LAST_COMMAND_KEY,
      command
    );
    logger.logDebug(`Stored last command: ${command}`);
  }

  /**
   * Group Keeper references by recordUid for batch processing
   */
  protected groupKeeperRefsAndResolveOthers(
    envConfig: Record<string, string>,
    resolvedEnv: Record<string, string>
  ): Map<
    string,
    Array<{
      key: string;
      fieldType: KEEPER_NOTATION_FIELD_TYPES;
      itemName: string;
    }>
  > {
    const recordGroups = new Map<
      string,
      Array<{
        key: string;
        fieldType: KEEPER_NOTATION_FIELD_TYPES;
        itemName: string;
      }>
    >();

    for (const [key, value] of Object.entries(envConfig)) {
      if (typeof value === 'string' && validateKeeperReference(value)) {
        const parsedRef = parseKeeperReference(value);
        if (!parsedRef) {
          logger.logError(`Failed to parse keeper:// reference: ${value}`);
          continue;
        }

        const { recordUid, fieldType, itemName } = parsedRef;

        if (!recordGroups.has(recordUid)) {
          recordGroups.set(recordUid, []);
        }
        recordGroups.get(recordUid)?.push({ key, fieldType, itemName });
      } else {
        // Add non-keeper references to resolvedEnv
        resolvedEnv[key] = value;
      }
    }

    return recordGroups;
  }

  /**
   * Create terminal and run command with injected secrets
   */
  protected async createAndRunTerminal(
    command: string,
    resolvedEnv: Record<string, string>
  ): Promise<void> {
    const terminal = window.createTerminal({
      name: 'Keeper Secure Run',
      env: {
        ...process.env,
        ...resolvedEnv,
      },
    });

    terminal.show();
    terminal.sendText(command, true);
  }

  /**
   * Find all environment files in the workspace (only immediate subdirectories)
   */
  protected findEnvironmentFiles(workspaceRoot: string): string[] {
    try {
      const foundFiles: string[] = [];

      const items = fs.readdirSync(workspaceRoot);

      for (const item of items) {
        const fullPath = path.join(workspaceRoot, item);
        const stat = fs.statSync(fullPath);

        if (stat.isFile()) {
          // Check if this file matches environment file patterns
          if (isEnvironmentFile(item)) {
            foundFiles.push(fullPath);
          }
        }
      }

      logger.logInfo(`Found environment files at: ${foundFiles.join(', ')}`);

      return foundFiles;
    } catch (error: unknown) {
      logger.logError(`Failed to find environment files: ${error}`);
      return [];
    }
  }

  /**
   * Resolve secrets from environment file
   */
  protected async resolveSecrets(
    selectedEnvFile: string,
    fetchSecretCallback: (recordUid: string) => Promise<IRecordData>
  ): Promise<Record<string, string>> {
    const envFileContent = fs.readFileSync(selectedEnvFile, 'utf8');
    const envConfig = dotenv.parse(envFileContent);

    const resolvedEnv: Record<string, string> = {};
    const recordGroups = this.groupKeeperRefsAndResolveOthers(
      envConfig,
      resolvedEnv
    );

    if (recordGroups.size > 0) {
      await this.fetchAndResolveSecrets(
        recordGroups,
        resolvedEnv,
        fetchSecretCallback
      );
    }

    logger.logInfo(
      `Resolved ${Object.keys(resolvedEnv).length} environment variables`
    );
    return resolvedEnv;
  }

  /**
   * Fetch and resolve secrets from Keeper vault
   */
  private async fetchAndResolveSecrets(
    recordGroups: Map<
      string,
      Array<{
        key: string;
        fieldType: KEEPER_NOTATION_FIELD_TYPES;
        itemName: string;
      }>
    >,
    resolvedEnv: Record<string, string>,
    fetchSecretCallback: (recordUid: string) => Promise<IRecordData>
  ): Promise<void> {
    // Execute commands sequentially
    for (const [recordUid, references] of recordGroups.entries()) {
      logger.logInfo(
        `Fetching record: ${recordUid} with ${references.length} references`
      );

      try {
        const recordDetails = await fetchSecretCallback(recordUid);

        references.forEach(({ key, fieldType, itemName }) => {
          const value = FieldExtractor.extractFieldValue(
            recordDetails,
            fieldType,
            itemName
          );
          if (value !== null) {
            resolvedEnv[key] = value;
            logger.logInfo(`Resolved ${key}`);
          } else {
            logger.logError(
              `Failed to resolve keeper reference: keeper://${recordUid}/${fieldType}/${itemName}`
            );
            resolvedEnv[key] = `keeper://${recordUid}/${fieldType}/${itemName}`;
          }
        });
      } catch (error: unknown) {
        logger.logError(`Failed to fetch record ${recordUid}:`, error);
        references.forEach(({ key }) => {
          resolvedEnv[key] = `keeper://${recordUid}/error/failed_to_fetch`;
        });
      }
    }
  }
}
