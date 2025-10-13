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
    const authResult = await this.promptForKsmAuthTypeAndValue();
    if (!authResult) {
      logger.logError('No KSM auth type and value provided');
      return;
    }

    await this.initializeWithAuth(authResult, storeConfigPath);
  }

  /**
   * Handle existing configuration validation
   */
  private async handleExistingConfiguration(
    storeConfigPath: string
  ): Promise<void> {
    const storage = localConfigStorage(storeConfigPath);

    if (await this.isConfigurationExpired(storage)) {
      logger.logDebug('Configuration expired, re-authenticating');
      await window.showInformationMessage(
        'Keeper Secrets Manager authentication expired. Re-initializing...'
      );

      // Clean up expired config
      this.cleanupExpiredConfig(storeConfigPath);

      // Re-authenticate
      const authResult = await this.promptForKsmAuthTypeAndValue();
      if (!authResult) {
        logger.logError(
          'No KSM auth type and value provided for re-authentication'
        );
        return;
      }

      await this.initializeWithAuth(authResult, storeConfigPath);
    } else {
      // Configuration is valid
      this.ksmStorage = storage;
      this.isInitialized = true;
      logger.logDebug('KSM configuration validated successfully');
    }
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
          await this.initializeWithJsonConfig(authValue);
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
    const storage = localConfigStorage(storeConfigPath);
    await initializeStorage(storage, token);

    // Verify the storage works
    await getSecrets({ storage });

    this.ksmStorage = storage;
  }

  /**
   * Initialize with base64 config
   */
  private async initializeWithBase64(
    base64Config: string,
    storeConfigPath: string
  ): Promise<void> {
    const configJson = Buffer.from(base64Config, 'base64').toString('utf-8');
    // Write config to file
    fs.writeFileSync(storeConfigPath, configJson);

    const storage = localConfigStorage(storeConfigPath);
    await getSecrets({ storage });

    this.ksmStorage = storage;
  }

  /**
   * Initialize with JSON config file
   */
  private async initializeWithJsonConfig(
    configFilePath: string
  ): Promise<void> {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Config file not found: ${configFilePath}`);
    }

    const storage = localConfigStorage(configFilePath);
    await getSecrets({ storage });

    this.ksmStorage = storage;
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
   * Clean up expired configuration
   */
  private cleanupExpiredConfig(storeConfigPath: string): void {
    try {
      if (fs.existsSync(storeConfigPath)) {
        fs.unlinkSync(storeConfigPath);
        logger.logDebug('Deleted expired ksm-config.json file');
      }
    } catch (error) {
      logger.logError('Failed to delete expired config file', error);
    }
  }

  /**
   * Reset service state
   */
  private resetState(): void {
    this.isInitialized = false;
    this.ksmStorage = null;
  }

  /**
   * Get store config path
   */
  private async getStoreConfigPath(): Promise<string | undefined> {
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
    const authType = await customQuickPick(Object.values(KSM_METHOD_TYPES), {
      placeHolder: 'Choose your preferred KSM auth type',
      title: 'Keeper Secrets Manager configuration method',
    });

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
    return await customInputBox({
      placeHolder: `Enter your ${authType} value`,
      title: `Selected method: ${authType}`,
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
  public async getSecrets(): Promise<unknown> {
    if (!this.ksmStorage) {
      throw new Error('KSM storage not available');
    }
    return await getSecrets({ storage: this.ksmStorage });
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
      throw new Error('KSM storage not available');
    }

    return await callbackMethod();
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    logger.logDebug('Disposing KSM service');
    this.resetState();
    logger.logDebug('KSM service disposed');
  }
}
