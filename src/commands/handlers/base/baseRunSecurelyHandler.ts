import { ExtensionContext, Uri, window, workspace } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';
import {
  commonInputBoxOptions,
  commonQuickPickOptions,
  isEnvironmentFile,
  assertSafeKeeperNotationEnvValue,
  parseKeeperReference,
  StatusBarSpinner,
  validateKeeperReference,
} from '../../../utils/helper';
import path from 'path';
import fs from 'fs';
import {
  BASE_HANDLER_MESSAGES,
  KEEPER_NOTATION_FIELD_TYPES,
} from '../../../utils/constants';
import { FieldExtractor } from '../../utils/fieldExtractor';
import dotenv from 'dotenv';
import { IRecordData } from '../../../types/ksm';

export abstract class BaseRunSecurelyHandler extends BaseCommandHandler {
  constructor(
    protected context: ExtensionContext,
    protected spinner: StatusBarSpinner
  ) {
    super();
  }

  private static readonly LAST_COMMAND_KEY = 'lastRunSecurelyCommand';

  private readonly BROWSE_ENVIRONMENT_FILE_LABEL =
    '$(folder-opened) Browse Environment File';

  protected async executeRunSecurely(
    fetchSecretCallback: (recordUid: string) => Promise<IRecordData>
  ): Promise<void> {
    const workspaceRoot = await this.selectWorkspace();

    if (!workspaceRoot) {
      return;
    }

    const selectedEnvFile = await this.selectEnvironmentFile(workspaceRoot);

    if (!selectedEnvFile) {
      return;
    }

    const command = await this.getCommandFromUser();
    if (!command) {
      return;
    }

    this.spinner.show(BASE_HANDLER_MESSAGES.INFO.RESOLVING_SECRETS);

    const resolvedEnv = await this.resolveSecrets(
      selectedEnvFile,
      fetchSecretCallback
    );

    await this.createAndRunTerminal(command, resolvedEnv);

    this.spinner.hide();

    window.showInformationMessage(
      BASE_HANDLER_MESSAGES.INFO.COMMAND_STARTED_WITH_SECRETS_INJECTED
    );
  }

  /**
   * Select workspace to run securely in
   */
  private async selectWorkspace(): Promise<string | undefined> {
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.STARTING_WORKSPACE_SELECTION
    );
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_WORKSPACE_FOLDERS_FOUND
      );
      throw new Error(
        BASE_HANDLER_MESSAGES.ERROR.OPEN_FOLDER_OR_WORKSPACE_FIRST
      );
    }

    if (workspaceFolders.length === 1) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.SINGLE_WORKSPACE_FOUND +
          ' with name: ' +
          workspaceFolders[0].name
      );
      return workspaceFolders[0].uri.fsPath;
    }

    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.MULTIPLE_WORKSPACES_FOUND +
        ' with count: ' +
        workspaceFolders.length
    );

    const workspaceNames = workspaceFolders.map((folder) => folder.name);
    const selected = await window.showQuickPick(workspaceNames, {
      ...commonQuickPickOptions,
      placeHolder:
        BASE_HANDLER_MESSAGES.INPUT
          .SELECT_WORKSPACE_TO_RUN_SECURELY_IN_PLACEHOLDER,
    });

    if (!selected) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_CANCELLED_WORKSPACE_SELECTION
      );
      return;
    }

    const selectedWorkspace = workspaceFolders.find(
      (folder) => folder.name === selected
    );
    if (!selectedWorkspace) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_SELECTED_WORKSPACE_NOT_FOUND +
          ' with name: ' +
          selected
      );
      throw new Error(BASE_HANDLER_MESSAGES.ERROR.WORKSPACE_NOT_FOUND);
    }
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_SELECTED_WORKSPACE +
        ' with name: ' +
        selectedWorkspace.name
    );
    return selectedWorkspace.uri.fsPath;
  }

  /**
   * Select environment file to use
   */
  private async selectEnvironmentFile(
    workspaceRoot: string
  ): Promise<string | undefined> {
    const envFiles = this.findEnvironmentFiles(workspaceRoot);

    // Multiple files - let user choose
    const envFileNames = envFiles.map((file) =>
      path.relative(workspaceRoot, file)
    );
    const selected = await window.showQuickPick(
      [this.BROWSE_ENVIRONMENT_FILE_LABEL, ...envFileNames],
      {
        ...commonQuickPickOptions,
        placeHolder:
          BASE_HANDLER_MESSAGES.INPUT
            .SELECT_ENVIRONMENT_FILE_TO_USE_PLACEHOLDER,
      }
    );

    if (!selected) {
      return;
    }

    if (selected === this.BROWSE_ENVIRONMENT_FILE_LABEL) {
      // Open file picker to select .env.* files
      const fileUris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: Uri.file(workspaceRoot),
        openLabel:
          BASE_HANDLER_MESSAGES.INPUT.SELECT_ENVIRONMENT_FILE_TO_USE_LABEL,
      });

      if (!fileUris || fileUris.length === 0) {
        return;
      }

      const selectedFilePath = fileUris[0].fsPath;
      const fileName = path.basename(selectedFilePath);

      if (isEnvironmentFile(fileName)) {
        return selectedFilePath;
      }

      throw new Error(
        BASE_HANDLER_MESSAGES.ERROR.SELECTED_FILE_IS_NOT_AN_ENVIRONMENT_FILE
      );
    }

    const selectedIndex = envFileNames.indexOf(selected);
    return envFiles[selectedIndex];
  }

  /**
   * Get command to run from user
   */
  private async getCommandFromUser(): Promise<string | undefined> {
    const lastCommand = this.getLastCommand();

    const command = await window.showInputBox({
      ...commonInputBoxOptions,
      prompt:
        BASE_HANDLER_MESSAGES.INPUT
          .ENTER_COMMAND_TO_RUN_WITH_KEEPER_SECRETS_INJECTED_PROMPT,
      placeHolder:
        BASE_HANDLER_MESSAGES.INPUT
          .ENTER_COMMAND_TO_RUN_WITH_KEEPER_SECRETS_INJECTED_PLACEHOLDER,
      value: lastCommand || '',
    });

    if (!command) {
      return;
    }

    // Store the command for next time
    this.setLastCommand(command);

    return command;
  }

  /**
   * Get the last command that was used for run securely
   */
  private getLastCommand(): string | undefined {
    return this.context.workspaceState.get(
      BaseRunSecurelyHandler.LAST_COMMAND_KEY
    );
  }

  /**
   * Store the command for future use
   */
  private setLastCommand(command: string): void {
    this.context.workspaceState.update(
      BaseRunSecurelyHandler.LAST_COMMAND_KEY,
      command
    );
  }

  /**
   * Group Keeper references by recordUid for batch processing
   */
  private groupKeeperRefsAndResolveOthers(
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
      if (typeof value === 'string' && value.startsWith('keeper://')) {
        try {
          assertSafeKeeperNotationEnvValue(value, key);
        } catch (error) {
          window.showErrorMessage(
            BASE_HANDLER_MESSAGES.ERROR.INVALID_KEEPER_REFERENCE_IN_ENV
          );
          throw error;
        }
      }

      if (typeof value === 'string' && validateKeeperReference(value)) {
        const parsedRef = parseKeeperReference(value);
        if (!parsedRef) {
          logger.logError(
            BASE_HANDLER_MESSAGES.ERROR.FAILED_TO_PARSE_KEEPER_REFERENCE +
              ': ' +
              value
          );
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
  private async createAndRunTerminal(
    command: string,
    resolvedEnv: Record<string, string>
  ): Promise<void> {
    const terminal = window.createTerminal({
      name: BASE_HANDLER_MESSAGES.INPUT.TERMINAL_NAME,
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
  private findEnvironmentFiles(workspaceRoot: string): string[] {
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

      return foundFiles;
    } catch (error: unknown) {
      logger.logError(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_ERROR.FAILED_TO_FIND_ENVIRONMENT_FILES +
          ' with error: ' +
          error
      );
      return [];
    }
  }

  /**
   * Resolve secrets from environment file
   */
  private async resolveSecrets(
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
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_INFO.RESOLVED_ENVIRONMENT_VARIABLES +
        ' with count: ' +
        Object.keys(resolvedEnv).length
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
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_INFO.FETCHING_RECORD +
          ' with recordUid: ' +
          recordUid +
          ' with count: ' +
          references.length
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
            logger.logInfo(
              this.constructor.name +
                ': ' +
                BASE_HANDLER_MESSAGES.LOGGER_INFO.RESOLVED_SECRET +
                ' with key: ' +
                key
            );
          } else {
            logger.logError(
              this.constructor.name +
                ': ' +
                BASE_HANDLER_MESSAGES.LOGGER_ERROR
                  .FAILED_TO_RESOLVE_KEEPER_REFERENCE +
                ' with reference: ' +
                `keeper://${recordUid}/${fieldType}/${itemName}`
            );
            resolvedEnv[key] = `keeper://${recordUid}/${fieldType}/${itemName}`;
          }
        });
      } catch (error: unknown) {
        logger.logError(
          this.constructor.name +
            ': ' +
            BASE_HANDLER_MESSAGES.LOGGER_ERROR.FAILED_TO_FETCH_RECORD +
            ' with recordUid: ' +
            recordUid +
            ' with error: ' +
            error
        );
        references.forEach(({ key }) => {
          resolvedEnv[key] = `keeper://${recordUid}/error/failed_to_fetch`;
        });
      }
    }
  }
}
