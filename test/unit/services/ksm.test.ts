import { ExtensionContext, Uri, window, workspace } from 'vscode';
import {
  initializeStorage,
  getSecrets,
  getFolders,
  createSecret2,
  localConfigStorage,
  KeyValueStorage,
  CreateOptions,
} from '@keeper-security/secrets-manager-core';
import fs from 'fs';
import { StatusBarSpinner } from '../../../src/utils/helper';
import { KsmService } from '../../../src/services/ksm';
import { KSM_CONFIG_FILE_NAME, KSM_METHOD_TYPES } from '../../../src/utils/constants';
import { KSM_INFO_MESSAGES } from '../../../src/utils/ksm-messages';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('vscode', () => ({
  window: {
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    showOpenDialog: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  workspace: {
    workspaceFolders: [],
  },
  Uri: {
    joinPath: jest.fn(),
    file: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    logDebug: jest.fn(),
    logError: jest.fn(),
  },
}));

jest.mock('../../../src/utils/helper', () => ({
  commonQuickPickOptions: {
    ignoreFocusOut: true,
  },
  commonInputBoxOptions: {
    ignoreFocusOut: true,
  },
  StatusBarSpinner: jest.fn(),
}));

jest.mock('@keeper-security/secrets-manager-core', () => ({
  initializeStorage: jest.fn(),
  getSecrets: jest.fn(),
  getFolders: jest.fn(),
  createSecret2: jest.fn(),
  localConfigStorage: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(), // Add this
}));

jest.mock('../../../src/utils/constants', () => ({
  KSM_METHOD_TYPES: {
    ONE_TIME_TOKEN: 'One Time Access Token',
    BASE64: 'Base64 Encoded',
    JSON_CONFIG: 'JSON Config File Path',
  },
  KSM_CONFIG_FILE_NAME: 'ksm-config.json',
}));

jest.mock('../../../src/utils/ksm-messages', () => ({
  KSM_INFO_MESSAGES: {
    AUTHENTICATED_WITH_KSM: 'Keeper Secrets Manager authenticated successfully',
  },
}));

describe('KsmService', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockStorage: jest.Mocked<KeyValueStorage>;
  let ksmService: KsmService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ExtensionContext
    mockContext = {
      subscriptions: [],
    } as unknown as ExtensionContext;

    // Mock StatusBarSpinner
    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;
    (StatusBarSpinner as jest.Mock).mockImplementation(() => mockSpinner);

    // Mock Storage
    mockStorage = {} as jest.Mocked<KeyValueStorage>;
    (localConfigStorage as jest.Mock).mockReturnValue(mockStorage);

    // Mock workspace
    (workspace as any).workspaceFolders = [
      {
        uri: {
          fsPath: '/workspace',
        },
      },
    ];

    // Mock Uri.joinPath
    (Uri.joinPath as jest.Mock).mockReturnValue({
      fsPath: '/workspace/.vscode/ksm-config.json',
    });

    // Mock Uri.file
    (Uri.file as jest.Mock).mockReturnValue({
      fsPath: '/workspace',
    });

    ksmService = new KsmService(mockContext, mockSpinner);
  });

  describe('constructor', () => {
    it('should create KsmService instance', () => {
      expect(ksmService).toBeInstanceOf(KsmService);
    });

    it('should initialize with context and spinner', () => {
      const service = new KsmService(mockContext, mockSpinner);
      expect(service).toBeDefined();
    });
  });

  describe('getStoreConfigPath', () => {
    it('should return config path when workspace folder exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true); // .vscode directory exists
      const vscodeDirUri = { fsPath: '/workspace/.vscode' };
      
      // Mock Uri.joinPath to return different values for each call
      (Uri.joinPath as jest.Mock)
        .mockReturnValueOnce(vscodeDirUri) // First call: workspace + '.vscode'
        .mockReturnValueOnce({ fsPath: '/workspace/.vscode/ksm-config.json' }); // Second call: vscodeDirUri + filename
      
      const path = await ksmService.getStoreConfigPath();

      expect(path).toBe('/workspace/.vscode/ksm-config.json');
      
      // Verify both calls to Uri.joinPath
      expect(Uri.joinPath).toHaveBeenCalledTimes(2);
      expect(Uri.joinPath).toHaveBeenNthCalledWith(
        1,
        { fsPath: '/workspace' },
        '.vscode'
      );
      expect(Uri.joinPath).toHaveBeenNthCalledWith(
        2,
        vscodeDirUri,
        KSM_CONFIG_FILE_NAME
      );
      expect(fs.existsSync).toHaveBeenCalledWith('/workspace/.vscode');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create .vscode directory when it does not exist', async () => {
      const vscodeDirUri = { fsPath: '/workspace/.vscode' };
      (Uri.joinPath as jest.Mock)
        .mockReturnValueOnce(vscodeDirUri) // First call for .vscode directory
        .mockReturnValueOnce({ fsPath: '/workspace/.vscode/ksm-config.json' }); // Second call for file
      (fs.existsSync as jest.Mock).mockReturnValue(false); // .vscode directory doesn't exist
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

      const path = await ksmService.getStoreConfigPath();

      expect(path).toBe('/workspace/.vscode/ksm-config.json');
      expect(fs.existsSync).toHaveBeenCalledWith('/workspace/.vscode');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/workspace/.vscode', { recursive: true });
      expect(logger.logDebug).toHaveBeenCalledWith('Created .vscode directory');
    });

    it('should return undefined and show error when no workspace folder', async () => {
      (workspace as any).workspaceFolders = undefined;

      const path = await ksmService.getStoreConfigPath();

      expect(path).toBeUndefined();
      expect(window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open');
    });

    it('should return undefined when workspace folders array is empty', async () => {
      (workspace as any).workspaceFolders = [];

      const path = await ksmService.getStoreConfigPath();

      expect(path).toBeUndefined();
      expect(window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open');
    });
  });

  describe('isKsmReady', () => {
    it('should return true when already initialized', async () => {
      // Initialize first
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).lazyInitialize();

      const result = await ksmService.isKsmReady();

      expect(result).toBe(true);
    });

    it('should initialize and return true when not initialized', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      const result = await ksmService.isKsmReady();

      expect(result).toBe(true);
      expect(mockSpinner.show).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return false when initialization fails', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await ksmService.isKsmReady();

      expect(result).toBe(false);
    });

    it('should return false when getStoreConfigPath returns undefined', async () => {
      (workspace as any).workspaceFolders = undefined;

      const result = await ksmService.isKsmReady();

      expect(result).toBe(false);
    });
  });

  describe('lazyInitialize', () => {
    it('should skip initialization if already initialized', async () => {
      // Initialize first
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).lazyInitialize();
      jest.clearAllMocks();

      // Second call should skip
      await (ksmService as any).lazyInitialize();

      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should handle initialization error', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockRejectedValue(new Error('Init failed'));

      await (ksmService as any).lazyInitialize();

      expect(logger.logError).toHaveBeenCalledWith(
        'Failed to initialize Keeper Security Extension',
        expect.any(Error)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when getStoreConfigPath returns undefined', async () => {
      (workspace as any).workspaceFolders = undefined;

      await (ksmService as any).lazyInitialize();

      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should call handleInitialAuthentication when config does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).lazyInitialize();

      expect(window.showQuickPick).toHaveBeenCalled();
      expect(initializeStorage).toHaveBeenCalled();
    });

    it('should call handleExistingConfiguration when config exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).lazyInitialize();

      expect(getSecrets).toHaveBeenCalled();
    });
  });

  describe('handleInitialAuthentication', () => {
    it('should authenticate when user provides auth info', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).handleInitialAuthentication('/path/to/config');

      expect(window.showQuickPick).toHaveBeenCalled();
      expect(initializeStorage).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith('Initial authentication completed successfully');
    });

    it('should return early when user cancels auth', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await (ksmService as any).handleInitialAuthentication('/path/to/config');

      expect(logger.logError).toHaveBeenCalledWith('No KSM auth type and value provided');
      expect(initializeStorage).not.toHaveBeenCalled();
    });
  });

  describe('handleExistingConfiguration', () => {
    it('should validate existing config when valid', async () => {
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).handleExistingConfiguration('/path/to/config');

      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect(localConfigStorage).toHaveBeenCalledWith('/path/to/config');
      expect((ksmService as any).isInitialized).toBe(true);
      expect((ksmService as any).ksmStorage).toBe(mockStorage);
    });

    it('should re-authenticate when config is expired', async () => {
      // First getSecrets call (in isConfigurationExpired) should fail
      // Second getSecrets call (in initializeWithOneTimeToken) should succeed
      (getSecrets as jest.Mock)
        .mockRejectedValueOnce(new Error('token expired'))
        .mockResolvedValueOnce({ records: [] });
      
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('new-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);

      await (ksmService as any).handleExistingConfiguration('/path/to/config');

      expect(localConfigStorage).toHaveBeenCalledWith('/path/to/config');
      expect(getSecrets).toHaveBeenCalledTimes(2); // Once for expired check, once for verification
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Keeper Secrets Manager authentication expired. Re-initializing...'
      );
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(window.showQuickPick).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith('Re-authentication completed successfully');
    });

    it('should return early when user cancels re-authentication', async () => {
      (getSecrets as jest.Mock).mockRejectedValue(new Error('token expired'));
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await (ksmService as any).handleExistingConfiguration('/path/to/config');

      expect(logger.logError).toHaveBeenCalledWith(
        'No KSM auth type and value provided for re-authentication'
      );
    });
  });

  describe('handleReAuthentication', () => {
    it('should re-authenticate successfully', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('new-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await ksmService.handleReAuthentication('/path/to/config');

      expect(logger.logDebug).toHaveBeenCalledWith('Keeper Secrets Manager re-authenticating.');
      expect(window.showQuickPick).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(initializeStorage).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        KSM_INFO_MESSAGES.AUTHENTICATED_WITH_KSM
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'Keeper Secrets Manager re-authenticated successfully.'
      );
    });

    it('should return early when user cancels', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await ksmService.handleReAuthentication('/path/to/config');

      expect(logger.logError).toHaveBeenCalledWith('No KSM auth type and value provided');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should reset state before re-authenticating', async () => {
      (ksmService as any).isInitialized = true;
      (ksmService as any).ksmStorage = mockStorage;
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('new-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await ksmService.handleReAuthentication('/path/to/config');

      expect((ksmService as any).isInitialized).toBe(true); // Set to true after init
    });
  });

  describe('initializeWithAuth', () => {
    it('should initialize with one-time token', async () => {
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).initializeWithAuth(
        {
          authType: KSM_METHOD_TYPES.ONE_TIME_TOKEN,
          authValue: 'test-token',
        },
        '/path/to/config'
      );

      expect(initializeStorage).toHaveBeenCalledWith(mockStorage, 'test-token');
      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect((ksmService as any).isInitialized).toBe(true);
      expect((ksmService as any).ksmStorage).toBe(mockStorage);
    });

    it('should initialize with base64 config', async () => {
      const base64Config = Buffer.from('{"test": "data"}').toString('base64');
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).initializeWithAuth(
        {
          authType: KSM_METHOD_TYPES.BASE64,
          authValue: base64Config,
        },
        '/path/to/config'
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/config',
        '{"test": "data"}'
      );
      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect((ksmService as any).ksmStorage).toBe(mockStorage);
    });

    it('should initialize with JSON config file', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('{"test": "data"}');
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).initializeWithAuth(
        {
          authType: KSM_METHOD_TYPES.JSON_CONFIG,
          authValue: '/path/to/config.json',
        },
        '/path/to/store'
      );

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/config.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/store', '{"test": "data"}');
      expect(localConfigStorage).toHaveBeenCalledWith('/path/to/config.json');
      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
    });

    it('should throw error for unsupported auth type', async () => {
      await expect(
        (ksmService as any).initializeWithAuth(
          {
            authType: 'unsupported' as any,
            authValue: 'value',
          },
          '/path/to/config'
        )
      ).rejects.toThrow('Unsupported auth type: unsupported');
    });

    it('should throw error when JSON config file not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(
        (ksmService as any).initializeWithAuth(
          {
            authType: KSM_METHOD_TYPES.JSON_CONFIG,
            authValue: '/path/to/nonexistent.json',
          },
          '/path/to/config'
        )
      ).rejects.toThrow('Config file not found: /path/to/nonexistent.json');
    });

    it('should handle error during initialization and throw', async () => {
      (initializeStorage as jest.Mock).mockRejectedValue(new Error('Init error'));

      await expect(
        (ksmService as any).initializeWithAuth(
          {
            authType: KSM_METHOD_TYPES.ONE_TIME_TOKEN,
            authValue: 'test-token',
          },
          '/path/to/config'
        )
      ).rejects.toThrow('Init error');

      expect(logger.logError).toHaveBeenCalledWith(
        'Failed to initialize with One Time Access Token',
        expect.any(Error)
      );
    });
  });

  describe('initializeWithOneTimeToken', () => {
    it('should initialize successfully', async () => {
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).initializeWithOneTimeToken('token', '/path/to/config');

      expect(localConfigStorage).toHaveBeenCalledWith('/path/to/config');
      expect(initializeStorage).toHaveBeenCalledWith(mockStorage, 'token');
      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect((ksmService as any).ksmStorage).toBe(mockStorage);
    });

    it('should handle error during getSecrets verification', async () => {
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockRejectedValue(new Error('Verification failed'));

      await expect(
        (ksmService as any).initializeWithOneTimeToken('token', '/path/to/config')
      ).rejects.toThrow('Verification failed');
    });
  });

  describe('initializeWithBase64', () => {
    it('should initialize successfully', async () => {
      const base64Config = Buffer.from('{"key": "value"}').toString('base64');
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      await (ksmService as any).initializeWithBase64(base64Config, '/path/to/config');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/config',
        '{"key": "value"}'
      );
      expect(localConfigStorage).toHaveBeenCalledWith('/path/to/config');
      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect((ksmService as any).ksmStorage).toBe(mockStorage);
    });

    it('should handle error during getSecrets verification', async () => {
      const base64Config = Buffer.from('{"key": "value"}').toString('base64');
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      (getSecrets as jest.Mock).mockRejectedValue(new Error('Verification failed'));

      await expect(
        (ksmService as any).initializeWithBase64(base64Config, '/path/to/config')
      ).rejects.toThrow('Verification failed');
    });
  });

  describe('isConfigurationExpired', () => {
    it('should return false when config is valid', async () => {
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      const result = await (ksmService as any).isConfigurationExpired(mockStorage);

      expect(result).toBe(false);
    });

    it('should return true when config has expired pattern', async () => {
      const expiredMessages = [
        'access_denied',
        'signature is invalid',
        'authentication failed',
        'token expired',
        'Client Id is missing',
      ];

      for (const message of expiredMessages) {
        jest.clearAllMocks();
        (getSecrets as jest.Mock).mockRejectedValue(new Error(message));

        const result = await (ksmService as any).isConfigurationExpired(mockStorage);

        expect(result).toBe(true);
      }
    });

    it('should return false for other errors', async () => {
      (getSecrets as jest.Mock).mockRejectedValue(new Error('network error'));

      const result = await (ksmService as any).isConfigurationExpired(mockStorage);

      expect(result).toBe(false);
    });

    it('should handle error without message', async () => {
      (getSecrets as jest.Mock).mockRejectedValue({});

      const result = await (ksmService as any).isConfigurationExpired(mockStorage);

      expect(result).toBe(false);
    });
  });

  describe('getSecrets', () => {
    it('should get all secrets', async () => {
      const mockSecrets = { records: [{ recordUid: '123' }] };
      (ksmService as any).ksmStorage = mockStorage;
      (ksmService as any).isInitialized = true;
      (getSecrets as jest.Mock).mockResolvedValue(mockSecrets);

      const result = await ksmService.getSecrets();

      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage });
      expect(result).toBe(mockSecrets);
    });
  });

  describe('getSecretByRecordUid', () => {
    it('should get secret by record UID', async () => {
      const mockSecret = { records: [{ recordUid: '123' }] };
      (ksmService as any).ksmStorage = mockStorage;
      (ksmService as any).isInitialized = true;
      (getSecrets as jest.Mock).mockResolvedValue(mockSecret);

      const result = await ksmService.getSecretByRecordUid('123');

      expect(getSecrets).toHaveBeenCalledWith({ storage: mockStorage }, ['123']);
      expect(result).toBe(mockSecret);
    });
  });

  describe('getFolders', () => {
    it('should get folders', async () => {
      const mockFolders = [{ folderUid: '1', name: 'Folder 1' }];
      (ksmService as any).ksmStorage = mockStorage;
      (ksmService as any).isInitialized = true;
      (getFolders as jest.Mock).mockResolvedValue(mockFolders);

      const result = await ksmService.getFolders();

      expect(getFolders).toHaveBeenCalledWith({ storage: mockStorage });
      expect(result).toBe(mockFolders);
    });
  });

  describe('createSecret', () => {
    it('should create secret', async () => {
      const mockOptions = {} as CreateOptions;
      const mockRecordData = { title: 'Test' };
      (ksmService as any).ksmStorage = mockStorage;
      (ksmService as any).isInitialized = true;
      (createSecret2 as jest.Mock).mockResolvedValue('new-record-uid');

      const result = await ksmService.createSecret(mockOptions, mockRecordData);

      expect(createSecret2).toHaveBeenCalledWith(
        { storage: mockStorage },
        mockOptions,
        mockRecordData
      );
      expect(result).toBe('new-record-uid');
    });
  });

  describe('executeKsmCommand', () => {
    it('should execute command when initialized', async () => {
      const mockCallback = jest.fn().mockResolvedValue('result');
      (ksmService as any).ksmStorage = mockStorage;
      (ksmService as any).isInitialized = true;

      const result = await ksmService.executeKsmCommand(mockCallback);

      expect(mockCallback).toHaveBeenCalled();
      expect(result).toBe('result');
      expect(logger.logDebug).toHaveBeenCalledWith('Executing KSM command:', expect.any(String));
    });

    it('should initialize before executing command', async () => {
      const mockCallback = jest.fn().mockResolvedValue('result');
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-token');
      (initializeStorage as jest.Mock).mockResolvedValue(undefined);
      (getSecrets as jest.Mock).mockResolvedValue({ records: [] });

      const result = await ksmService.executeKsmCommand(mockCallback);

      expect(mockCallback).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should throw error when storage is null', async () => {
      (ksmService as any).ksmStorage = null;
      (ksmService as any).isInitialized = false;
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await expect(
        ksmService.executeKsmCommand(jest.fn().mockResolvedValue('result'))
      ).rejects.toThrow('Keeper Secrets Manager not authenticated');
    });
  });

  describe('promptForKsmAuthTypeAndValue', () => {
    it('should prompt for auth type and value - ONE_TIME_TOKEN', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue('test-value');

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toEqual({
        authType: KSM_METHOD_TYPES.ONE_TIME_TOKEN,
        authValue: 'test-value',
      });
    });

    it('should prompt for auth type and value - BASE64', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.BASE64);
      (window.showInputBox as jest.Mock).mockResolvedValue('base64-value');

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toEqual({
        authType: KSM_METHOD_TYPES.BASE64,
        authValue: 'base64-value',
      });
    });

    it('should return undefined when user cancels', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toBeUndefined();
    });

    it('should prompt for config file for JSON_CONFIG type', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.JSON_CONFIG);
      (window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/path/to/config.json' },
      ]);

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(window.showOpenDialog).toHaveBeenCalled();
      expect(result?.authType).toBe(KSM_METHOD_TYPES.JSON_CONFIG);
      expect(result?.authValue).toBe('/path/to/config.json');
    });

    it('should return undefined when config file selection is cancelled', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.JSON_CONFIG);
      (window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toBeUndefined();
    });

    it('should return undefined when user cancels input value', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toBeUndefined();
    });

    it('should return undefined for unsupported auth type', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue('unsupported' as any);

      const result = await (ksmService as any).promptForKsmAuthTypeAndValue();

      expect(result).toBeUndefined();
    });
  });

  describe('promptForConfigFile', () => {
    it('should return file path when file is selected', async () => {
      (window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/path/to/config.json' },
      ]);

      const result = await (ksmService as any).promptForConfigFile();

      expect(result).toBe('/path/to/config.json');
      expect(window.showOpenDialog).toHaveBeenCalledWith({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: expect.any(Object),
        openLabel: 'Select KSM config file',
        filters: {
          'JSON Files': ['json'],
        },
      });
    });

    it('should return undefined when no file is selected', async () => {
      (window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

      const result = await (ksmService as any).promptForConfigFile();

      expect(result).toBeUndefined();
    });

    it('should return undefined when empty array is returned', async () => {
      (window.showOpenDialog as jest.Mock).mockResolvedValue([]);

      const result = await (ksmService as any).promptForConfigFile();

      expect(result).toBeUndefined();
    });
  });

  describe('promptForAuthValue', () => {
    it('should prompt for auth value', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue('test-value');

      const result = await (ksmService as any).promptForAuthValue(KSM_METHOD_TYPES.ONE_TIME_TOKEN);

      expect(window.showInputBox).toHaveBeenCalledWith({
        ignoreFocusOut: true,
        prompt: `Enter your ${KSM_METHOD_TYPES.ONE_TIME_TOKEN} value`,
        placeHolder: `Enter your ${KSM_METHOD_TYPES.ONE_TIME_TOKEN} value`,
      });
      expect(result).toBe('test-value');
    });

    it('should return undefined when user cancels', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await (ksmService as any).promptForAuthValue(KSM_METHOD_TYPES.BASE64);

      expect(result).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('should dispose service and reset state', async () => {
      (ksmService as any).isInitialized = true;
      (ksmService as any).ksmStorage = mockStorage;

      await ksmService.dispose();

      expect(logger.logDebug).toHaveBeenCalledWith('Disposing KSM service');
      expect((ksmService as any).isInitialized).toBe(false);
      expect((ksmService as any).ksmStorage).toBeNull();
      expect(logger.logDebug).toHaveBeenCalledWith('KSM service disposed');
    });
  });

  describe('resetState', () => {
    it('should reset state correctly', async () => {
      (ksmService as any).isInitialized = true;
      (ksmService as any).ksmStorage = mockStorage;

      await (ksmService as any).resetState();

      expect((ksmService as any).isInitialized).toBe(false);
      expect((ksmService as any).ksmStorage).toBeNull();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'Keeper Secrets Manager state reset successfully.'
      );
    });
  });

  describe('cleanupConfig', () => {
    it('should delete config file when it exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      (ksmService as any).cleanupConfig('/path/to/config');

      expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/config');
      expect(logger.logDebug).toHaveBeenCalledWith('Deleted ksm-config.json file');
    });

    it('should handle error when deleting config file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        throw new Error('Delete failed');
      });

      (ksmService as any).cleanupConfig('/path/to/config');

      expect(logger.logError).toHaveBeenCalledWith(
        'Failed to delete config file',
        expect.any(Error)
      );
    });

    it('should not throw when file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => {
        (ksmService as any).cleanupConfig('/path/to/config');
      }).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
