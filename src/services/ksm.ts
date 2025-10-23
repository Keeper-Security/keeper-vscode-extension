import { ExtensionContext, Uri, window, workspace } from 'vscode';
import {
  commonInputBoxOptions,
  commonQuickPickOptions,
  StatusBarSpinner,
} from '../utils/helper';
import { logger } from '../utils/logger';
import {
  CreateOptions,
  createSecret2,
  getFolders,
  getSecrets,
  initializeStorage,
  KeyValueStorage,
  localConfigStorage,
} from '@keeper-security/secrets-manager-core';
import { KSM_CONFIG_FILE_NAME, KSM_METHOD_TYPES } from '../utils/constants';
import fs from 'fs';
import { IKsmGetSecretsResponse } from '../types/ksm';
import { IKsmGetFoldersResponse } from '../types';
import { KSM_INFO_MESSAGES } from '../utils/ksm-messages';

interface KsmAuthResult {
  authType: KSM_METHOD_TYPES;
  authValue: string;
}

export class KsmService {
  private isInitialized = false;
  private ksmStorage: KeyValueStorage | null = null;
  private readonly configFileName = KSM_CONFIG_FILE_NAME;

  public constructor(
    readonly context: ExtensionContext,
    private readonly spinner: StatusBarSpinner
  ) {}

  /**
   * Initialize KSM service lazily
   * 1. Check for existing config file
   * 2. If not exists, prompt for authentication
   * 3. If exists, validate configuration
   * 4. If invalid, re-authenticate
   */
  private async lazyInitialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.logDebug('Initializing KSM Keeper Security Extension');
      this.spinner.show('Initializing KSM Keeper Security Extension...');

      const storeConfigPath = await this.getStoreConfigPath();
      if (!storeConfigPath) {
        return;
      }

      // Check if config file exists
      if (!fs.existsSync(storeConfigPath)) {
        await this.handleInitialAuthentication(storeConfigPath);
      } else {
        await this.handleExistingConfiguration(storeConfigPath);
      }
    } catch (error) {
      logger.logError('Failed to initialize Keeper Security Extension', error);
      this.resetState();
    } finally {
      this.spinner.hide();
    }
  }

  /**
   * Handle initial authentication when no config file exists
   */
  private async handleInitialAuthentication(
    storeConfigPath: string
  ): Promise<void> {
    logger.logDebug('Handling initial authentication');

    const authResult = await this.promptForKsmAuthTypeAndValue();
    if (!authResult) {
      logger.logError('No KSM auth type and value provided');
      return;
    }

    await this.initializeWithAuth(authResult, storeConfigPath);

    logger.logDebug('Initial authentication completed successfully');
  }

  /**
   * Handle existing configuration validation
   */
  private async handleExistingConfiguration(
    storeConfigPath: string
  ): Promise<void> {
    logger.logDebug('Handling existing configuration');

    const storage = localConfigStorage(storeConfigPath);

    if (await this.isConfigurationExpired(storage)) {
      logger.logDebug('Configuration expired, re-authenticating');
      window.showInformationMessage(
        'Keeper Secrets Manager authentication expired. Re-initializing...'
      );

      // Clean up expired config
      this.cleanupConfig(storeConfigPath);

      // Re-authenticate
      const authResult = await this.promptForKsmAuthTypeAndValue();
      if (!authResult) {
        logger.logError(
          'No KSM auth type and value provided for re-authentication'
        );
        return;
      }

      await this.initializeWithAuth(authResult, storeConfigPath);

      logger.logDebug('Re-authentication completed successfully');
    } else {
      // Configuration is valid
      this.ksmStorage = storage;
      this.isInitialized = true;
      logger.logDebug('KSM configuration validated successfully');
    }
  }

  public async handleReAuthentication(storeConfigPath: string): Promise<void> {
    logger.logDebug('Keeper Secrets Manager re-authenticating.');

    const authResult = await this.promptForKsmAuthTypeAndValue();

    if (!authResult) {
      logger.logError('No KSM auth type and value provided');
      return;
    }

    await this.resetState();

    // Clean up config file
    this.cleanupConfig(storeConfigPath);

    await this.initializeWithAuth(authResult, storeConfigPath);
    logger.logDebug('Keeper Secrets Manager re-authenticated successfully.');
    window.showInformationMessage(KSM_INFO_MESSAGES.AUTHENTICATED_WITH_KSM);

  }

  /**
   * Initialize KSM with authentication result
   */
  private async initializeWithAuth(
    authResult: KsmAuthResult,
    storeConfigPath: string
  ): Promise<void> {
    const { authType, authValue } = authResult;

    try {
      switch (authType) {
        case KSM_METHOD_TYPES.ONE_TIME_TOKEN:
          await this.initializeWithOneTimeToken(authValue, storeConfigPath);
          break;
        case KSM_METHOD_TYPES.BASE64:
          await this.initializeWithBase64(authValue, storeConfigPath);
          break;
        case KSM_METHOD_TYPES.JSON_CONFIG:
          await this.initializeWithJsonConfig(authValue, storeConfigPath);
          break;
        default:
          throw new Error(`Unsupported auth type: ${authType}`);
      }

      this.isInitialized = true;
      logger.logDebug('KSM initialized successfully');
    } catch (error) {
      logger.logError(`Failed to initialize with ${authType}`, error);
      throw error;
    }
  }

  /**
   * Initialize with one-time token
   */
  private async initializeWithOneTimeToken(
    token: string,
    storeConfigPath: string
  ): Promise<void> {
    logger.logDebug('Initializing with one-time token');

    const storage = localConfigStorage(storeConfigPath);
    await initializeStorage(storage, token);

    // Verify the storage works
    await getSecrets({ storage });

    this.ksmStorage = storage;

    logger.logDebug('One-time token initialized successfully');
  }

  /**
   * Initialize with base64 config
   */
  private async initializeWithBase64(
    base64Config: string,
    storeConfigPath: string
  ): Promise<void> {
    logger.logDebug('Initializing with base64 config');

    const configJson = Buffer.from(base64Config, 'base64').toString('utf-8');
    // Write config to file
    fs.writeFileSync(storeConfigPath, configJson);

    const storage = localConfigStorage(storeConfigPath);
    await getSecrets({ storage });

    this.ksmStorage = storage;

    logger.logDebug('Base64 config initialized successfully');
  }

  /**
   * Initialize with JSON config file
   */
  private async initializeWithJsonConfig(
    configFilePath: string,
    storeConfigPath: string
  ): Promise<void> {
    logger.logDebug('Initializing with JSON config file');

    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Config file not found: ${configFilePath}`);
    }

    const configJson = fs.readFileSync(configFilePath, 'utf-8');
    fs.writeFileSync(storeConfigPath, configJson);

    const storage = localConfigStorage(configFilePath);
    await getSecrets({ storage });

    this.ksmStorage = storage;

    logger.logDebug('JSON config file initialized successfully');
  }

  /**
   * Check if configuration is expired
   */
  private async isConfigurationExpired(
    storage: KeyValueStorage
  ): Promise<boolean> {
    try {
      await getSecrets({ storage });
      return false;
    } catch (error) {
      const expiredPatterns = [
        'access_denied',
        'signature is invalid',
        'authentication failed',
        'token expired',
        'Client Id is missing',
      ];

      const errorMessage = error?.toString() || '';
      return expiredPatterns.some((pattern) => errorMessage.includes(pattern));
    }
  }

  /**
   * Clean up configuration
   */
  private cleanupConfig(storeConfigPath: string): void {
    try {
      if (fs.existsSync(storeConfigPath)) {
        fs.unlinkSync(storeConfigPath);
        logger.logDebug('Deleted ksm-config.json file');
      }
    } catch (error) {
      logger.logError('Failed to delete config file', error);
    }
  }

  /**
   * Reset service state
   */
  private async resetState(): Promise<void> {
    this.isInitialized = false;
    this.ksmStorage = null;
    logger.logDebug('Keeper Secrets Manager state reset successfully.');
  }

  /**
   * Get store config path
   */
  public async getStoreConfigPath(): Promise<string | undefined> {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      window.showErrorMessage('No workspace folder open');
      return;
    }

    const workspaceUri = workspaceFolders[0].uri;
    const fileUri = Uri.joinPath(workspaceUri, '.vscode', this.configFileName);

    return fileUri.fsPath;
  }

  /**
   * Prompt user for KSM authentication type and value
   */
  private async promptForKsmAuthTypeAndValue(): Promise<
    KsmAuthResult | undefined
  > {
    const authType = await window.showQuickPick(
      Object.values(KSM_METHOD_TYPES),
      {
        ...commonQuickPickOptions,
        placeHolder: 'Choose your preferred KSM auth type',
        title: 'Keeper Secrets Manager configuration method',
      }
    );

    if (!authType) {
      return;
    }

    let authValue: string | undefined;

    switch (authType) {
      case KSM_METHOD_TYPES.JSON_CONFIG:
        authValue = await this.promptForConfigFile();
        break;
      case KSM_METHOD_TYPES.ONE_TIME_TOKEN:
      case KSM_METHOD_TYPES.BASE64:
        authValue = await this.promptForAuthValue(authType);
        break;
      default:
        return;
    }

    if (!authValue) {
      return;
    }

    return { authType, authValue };
  }

  /**
   * Prompt for config file selection
   */
  private async promptForConfigFile(): Promise<string | undefined> {
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

    return selectedFileUri?.[0]?.fsPath;
  }

  /**
   * Prompt for auth value input
   */
  private async promptForAuthValue(
    authType: KSM_METHOD_TYPES
  ): Promise<string | undefined> {
    return await window.showInputBox({
      ...commonInputBoxOptions,
      prompt: `Enter your ${authType} value`,
      placeHolder: `Enter your ${authType} value`,
    });
  }

  // Public API methods

  /**
   * Check if KSM is ready
   */
  public async isKsmReady(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }
    return this.isInitialized;
  }

  /**
   * Get secrets from KSM
   */
  public async getSecrets(): Promise<IKsmGetSecretsResponse> {
    return (await getSecrets({
      storage: this.ksmStorage as KeyValueStorage,
    })) as IKsmGetSecretsResponse;
  }

  public async getSecretByRecordUid(
    recordUid: string
  ): Promise<IKsmGetSecretsResponse> {
    return (await getSecrets(
      {
        storage: this.ksmStorage as KeyValueStorage,
      },
      [recordUid]
    )) as IKsmGetSecretsResponse;
  }

  public async getFolders(): Promise<IKsmGetFoldersResponse[]> {
    return (await getFolders({
      storage: this.ksmStorage as KeyValueStorage,
    })) as IKsmGetFoldersResponse[];
  }

  public async createSecret(
    createOptions: CreateOptions,
    recordData: unknown
  ): Promise<string> {
    return await createSecret2(
      { storage: this.ksmStorage as KeyValueStorage },
      createOptions,
      recordData
    );
  }

  /**
   * Execute KSM command with proper initialization
   */
  public async executeKsmCommand<T>(
    callbackMethod: () => Promise<T>
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.lazyInitialize();
    }

    if (!this.ksmStorage) {
      throw new Error('Keeper Secrets Manager not authenticated');
    }

    logger.logDebug('Executing KSM command:', callbackMethod.name);

    return await callbackMethod();
  }

  /**
   * Dispose resources
   */
  public async dispose(): Promise<void> {
    logger.logDebug('Disposing KSM service');
    await this.resetState();
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
