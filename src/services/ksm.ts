import { ExtensionContext, Uri, window, workspace } from 'vscode';
import { StatusBarSpinner } from '../utils/helper';
import { logger } from '../utils/logger';
import {
  getSecrets,
  initializeStorage,
  KeyValueStorage,
  localConfigStorage,
} from '@keeper-security/secrets-manager-core';
import fs from 'fs';

export class KsmService {
  private isInitialized = false;

  public ksmStorage!: KeyValueStorage;

  public constructor(
    _context: ExtensionContext,
    private spinner: StatusBarSpinner
  ) {}

  /**
   * TODO:
   * 1. proper message for spinner
   * 2. error handling
   * 3. logging
   * 4. check proper storage is working with new, existing and invalid storage, reload window
   * 5. reset state with user is auth expired and then re-initialize
   * 6. logic to handle/store ksm-config.json file in global context of vs code with workspace id map to it - this will solve issue if user reload window and config file deleted
   * 7. edge cases
   */

  private async initializeKsmStorage(
    storeConfigPath: string,
    oneTimeToken: string
  ): Promise<void> {
    try {
      const storage = localConfigStorage(storeConfigPath);
      await initializeStorage(storage, oneTimeToken);

      this.ksmStorage = storage;
    } catch (error) {
      logger.logError('Failed to initialize KSM storage', error);
      throw error;
    }
  }

  private async promptForOneTimeToken(): Promise<string | undefined> {
    const oneTimeToken = await window.showInputBox({
      placeHolder: 'Enter your keeper secrets manager one time token',
      title: 'One Time Token',
      ignoreFocusOut: true,
    });

    if (!oneTimeToken) {
      return;
    }

    return oneTimeToken;
  }

  /**
   * 1. check for file ksm-config.json,
   * 2. if not exist means not authenticated: prompt user to enter one time token, use it to initializeStorage
   * 3. else then check for ksm-config.json is still valid by making simple call to ksm
   * 4. if valid then we are initialized
   * 5. if not valid, inform user as auth expired then perform step 2
   */
  private async lazyInitialize(): Promise<void> {
    try {
      logger.logDebug('KsmService.lazyInitialize: Starting initialization');
      this.spinner.show('Initializing KSM Keeper Security Extension...');

      const storeConfigPath = await this.getStoreConfigPath();
      logger.logDebug(`Store config path: ${storeConfigPath}`);

      if (!storeConfigPath) {
        logger.logError('No store config path found');
        return;
      }

      if (!fs.existsSync(storeConfigPath)) {
        const oneTimeToken = await this.promptForOneTimeToken();
        logger.logDebug(`One time token provided: ${!!oneTimeToken}`);

        if (!oneTimeToken) {
          return;
        }

        await this.initializeKsmStorage(storeConfigPath, oneTimeToken);
        this.ksmStorage = localConfigStorage(storeConfigPath);
        this.isInitialized = true;
        return;
      }

      // File exists, check if it's still valid
      const storage = localConfigStorage(storeConfigPath);
      const result = await getSecrets({ storage });

      if (!result.records.length) {
        await window.showInformationMessage(
          'Keeper Secrets Manager authentication expired. Re-initializing...'
        );

        const oneTimeToken = await this.promptForOneTimeToken();
        if (!oneTimeToken) {
          return;
        }

        await this.initializeKsmStorage(storeConfigPath, oneTimeToken);
        this.ksmStorage = localConfigStorage(storeConfigPath);
        this.isInitialized = true;
        return;
      }

      // Storage is valid
      this.ksmStorage = storage;
      this.isInitialized = true;
    } catch (error) {
      logger.logError('Failed to initialize Keeper Security Extension', error);
    } finally {
      this.spinner.hide();
    }
  }

  private async getStoreConfigPath(): Promise<string | undefined> {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      window.showErrorMessage('No workspace folder open');
      return;
    }

    const workspaceUri = workspaceFolders[0].uri;

    // File path: .vscode/ksm-config.json
    const fileUri = Uri.joinPath(workspaceUri, '.vscode', 'ksm-config.json');

    return fileUri.fsPath;
  }

  public async isKsmReady(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    return this.isInitialized;
  }

  public async getSecrets(): Promise<unknown> {
    return await getSecrets({ storage: this.ksmStorage });
  }

  public async executeKsmCommand<T>(
    callbackMethod: () => Promise<T>
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    if (!this.ksmStorage) {
      throw new Error('KSM storage not available');
    }

    return await callbackMethod();
  }

  public dispose(): void {
    logger.logDebug('Disposing KSM service');

    logger.logDebug('KSM service disposed');
  }
}
