import { ExtensionContext, Uri, window, workspace } from 'vscode';
import {
  customInputBox,
  customQuickPick,
  StatusBarSpinner,
} from '../utils/helper';
import { logger } from '../utils/logger';
import {
  getSecrets,
  initializeStorage,
  KeyValueStorage,
  localConfigStorage,
} from '@keeper-security/secrets-manager-core';
import { KSM_CONFIG_FILE_NAME, KSM_METHOD_TYPES } from '../utils/constants';
import fs from 'fs';

export class KsmService {
  private isInitialized = false;

  private ksmStorage!: KeyValueStorage | null;

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

      // get store config path
      const storeConfigPath = await this.getStoreConfigPath();

      if (!storeConfigPath) {
        return;
      }

      // first check for stored config file in workspace .vscode/ksm-config.json
      if (!fs.existsSync(storeConfigPath)) {
        // HERE initiate ksm auth
        await this.initiateKsmAuth();
      }

      // check if config file is still valid
      const storage = localConfigStorage(storeConfigPath);

      const isConfigurationExpired = await this.isConfigurationExpired(storage);

      if (isConfigurationExpired) {
        logger.logError(
          'Keeper Secrets Manager authentication expired. Re-initializing...'
        );
        window.showErrorMessage(
          'Keeper Secrets Manager authentication expired. Re-initializing...'
        );

        // delete existing ksm-config.json file
        fs.unlinkSync(storeConfigPath);
        logger.logDebug(
          'Authentication expired: Deleted existing ksm-config.json file'
        );

        this.isInitialized = false;
        this.ksmStorage = null;

        // re-initialize ksm
        await this.lazyInitialize();
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

  private async isConfigurationExpired(
    storage: KeyValueStorage
  ): Promise<boolean> {
    try {
      await getSecrets({ storage });
      return false;
    } catch (error) {
      const patterns = [
        'access_denied',
        'signature is invalid',
        'authentication failed',
        'token expired',
        'Client Id is missing',
      ];
      if (patterns.some((pattern) => error?.toString().includes(pattern))) {
        return true;
      }
      return false;
    }
  }

  private async initiateKsmAuth(): Promise<void> {
    const authPromtResult = await this.promptForKsmAuthTypeAndValue();

    if (!authPromtResult) {
      logger.logError('No KSM auth type and value provided');
      return;
    }

    const { authType, authValue } = authPromtResult;

    if (authType === KSM_METHOD_TYPES.ONE_TIME_TOKEN) {
      const storage = localConfigStorage(await this.getStoreConfigPath());
      await initializeStorage(storage, authValue);

      await getSecrets({ storage });

      this.ksmStorage = storage;
      this.isInitialized = true;
    }

    if (authType === KSM_METHOD_TYPES.BASE64) {
      const configFromBase64String = Buffer.from(authValue, 'base64').toString(
        'utf-8'
      );

      const storeConfigPath = await this.getStoreConfigPath();
      if (!storeConfigPath) {
        return;
      }

      fs.writeFileSync(storeConfigPath, configFromBase64String);

      const storage = localConfigStorage(storeConfigPath);

      await getSecrets({ storage });
      this.ksmStorage = storage;
      this.isInitialized = true;
    }

    if (authType === KSM_METHOD_TYPES.JSON_CONFIG) {
      const storage = localConfigStorage(authValue);
      await getSecrets({ storage });

      this.ksmStorage = storage;
      this.isInitialized = true;
    }
  }

  // construct the path to the ksm-config.json file
  private async getStoreConfigPath(): Promise<string | undefined> {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      window.showErrorMessage('No workspace folder open');
      return;
    }

    const workspaceUri = workspaceFolders[0].uri;

    // File path: .vscode/ksm-config.json
    const fileUri = Uri.joinPath(workspaceUri, '.vscode', KSM_CONFIG_FILE_NAME);

    return fileUri.fsPath;
  }

  public async isKsmReady(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    return this.isInitialized;
  }

  public async getSecrets(): Promise<unknown> {
    if (!this.ksmStorage) {
      throw new Error('KSM storage not available');
    }
    return await getSecrets({ storage: this.ksmStorage });
  }

  private async promptForKsmAuthTypeAndValue(): Promise<
    { authType: KSM_METHOD_TYPES; authValue: string } | undefined
  > {
    const authType = await customQuickPick(
      [
        KSM_METHOD_TYPES.ONE_TIME_TOKEN,
        KSM_METHOD_TYPES.BASE64,
        KSM_METHOD_TYPES.JSON_CONFIG,
      ],
      {
        placeHolder: 'Choose your preferred KSM auth type',
        title: 'Keeper Secrets Manager configuration method',
      }
    );

    if (!authType) {
      return;
    }

    let authValue;

    if (authType === KSM_METHOD_TYPES.JSON_CONFIG) {
      const selectedFileUri = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: Uri.file(workspace.workspaceFolders?.[0].uri.fsPath || ''),
        openLabel: 'Select KSM config file',
        filters: {
          'JSON Files': ['json'],
        },
      });

      if (!selectedFileUri || selectedFileUri.length === 0) {
        return;
      }

      authValue = selectedFileUri[0].fsPath;
    }

    if (
      authType === KSM_METHOD_TYPES.ONE_TIME_TOKEN ||
      authType === KSM_METHOD_TYPES.BASE64
    ) {
      const value = await customInputBox({
        placeHolder: `Enter your ${authType} value`,
        title: `Selected method: ${authType}`,
      });

      if (!value) {
        return;
      }

      authValue = value;
    }

    return {
      authType: authType as KSM_METHOD_TYPES,
      authValue: authValue as string,
    };
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

/**
 * Example of Different types of KSM Auth:
 * 
 * 1. One Time Token: For this We need to use initializeStorage
 * 
 *   const oneTimeToken = "US:HnXisFjTGe6TNHW77FubD2low7GxODTpSkvrhnZuQE0";
 *   const storage = localConfigStorage("ksm-config.json");
 *   await initializeStorage(storage, oneTimeToken);
 * 
 *   let recordUid = await getSecrets({ storage }); 
 * 
 * 
 * 2. Base64 string:
 * 
 *   const base64Config = "eyJob3N0bmFtZSI6ImtlZXBlcnNlY3VyaXR5LmNvbSIsImNsaWVudElkIjoicmRrVTVrejdLRkUzVjBXcnEwTTAyYlRGWnQzV0lvUnNFUDlJNkJOdnlGalVXQWZoYXNLN0t4MTd4eXhBQXIrUU91NW1kK3ZnZGQzaW5Xb29RNzNzRWc9PSIsInByaXZhdGVLZXkiOiJNSUdIQWdFQU1CTUdCeXFHU000OUFnRUdDQ3FHU000OUF3RUhCRzB3YXdJQkFRUWdRWjVCL3R5NEFVK2cxZkFjeThyZnJWWXo4M0JqWFU2aW9MUjBabk9qd3UyaFJBTkNBQVRUbTlGMTM1RjdJVnE5a085YjFJeEJIK2NaQi9FTFdFUk9LNlU3NnVIOWZYQTdkWmxrRmp0cVhWZkN0YXhaNHRyV0RVTnlaSDVzNFIyNFhvbFF5dmVBIiwic2VydmVyUHVibGljS2V5SWQiOiIxMCIsImFwcEtleSI6InZZeGtDcVZnOWdVbzFHdzVidFNnRjFVRmN4NllFYklQTUpQYk9odDJNVTQ9IiwiYXBwT3duZXJQdWJsaWNLZXkiOiJCQ2MwcGI2QjFqeGhtaXhxWWI1Tk12S21xQjJTWFptUXJlZnE2aVlRUHB6Y0FLQnhtYzQ1U2hjTHJJZXlyaUFpTEdVaFZYT2JvOWFCQkh5TEVJMCs4NGs9In0=";
 *   const config = Buffer.from(base64Config, "base64").toString("utf-8");
 *   const storage = inMemoryStorage(JSON.parse(config));

 *   let recordUid = await getSecrets({ storage });
 * 
 * 3. Config File Path:
 * 
 *   const storage = localConfigStorage("ksm-config.json");
 *   let recordUid = await getSecrets({ storage }); 
 * 
 * 
 */
