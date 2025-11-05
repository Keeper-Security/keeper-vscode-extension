import { window } from 'vscode';
import { KsmAuthenticateHandler } from '../../../../../src/commands/handlers/ksm/ksmAuthenticateHandler';
import { KsmService } from '../../../../../src/services/ksm';
import { KsmStorageManager } from '../../../../../src/commands/storage/ksmStorageManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KSM_ERROR_MESSAGES, KSM_INFO_MESSAGES } from '../../../../../src/utils/ksm-messages';

// Mock dependencies
jest.mock('../../../../../src/services/ksm');
jest.mock('../../../../../src/commands/storage/ksmStorageManager');
jest.mock('../../../../../src/utils/logger');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
    })),
  },
}));

describe('KsmAuthenticateHandler', () => {
  let mockKsmService: jest.Mocked<KsmService>;
  let mockStorageManager: jest.Mocked<KsmStorageManager>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let ksmAuthenticateHandler: KsmAuthenticateHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockKsmService = {
      getStoreConfigPath: jest.fn(),
      handleReAuthentication: jest.fn(),
    } as unknown as jest.Mocked<KsmService>;

    mockStorageManager = {
      setCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<KsmStorageManager>;

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    ksmAuthenticateHandler = new KsmAuthenticateHandler(
      mockSpinner,
      mockKsmService,
      mockStorageManager
    );
  });

  describe('constructor', () => {
    it('should initialize with spinner, ksmService, and storageManager', () => {
      expect(ksmAuthenticateHandler).toBeInstanceOf(KsmAuthenticateHandler);
    });
  });

  describe('execute', () => {
    it('should authenticate successfully', async () => {
      const mockConfigPath = '/path/to/config.json';
      mockKsmService.getStoreConfigPath.mockResolvedValue(mockConfigPath);
      mockKsmService.handleReAuthentication.mockResolvedValue(undefined);

      await ksmAuthenticateHandler.execute();

      expect(mockSpinner.show).toHaveBeenCalledWith(KSM_INFO_MESSAGES.AUTHENTICATING_WITH_KSM);
      expect(mockKsmService.getStoreConfigPath).toHaveBeenCalled();
      expect(mockKsmService.handleReAuthentication).toHaveBeenCalledWith(mockConfigPath);
      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when config path is not available', async () => {
      mockKsmService.getStoreConfigPath.mockResolvedValue(undefined as unknown as string);

      await ksmAuthenticateHandler.execute();

      expect(mockSpinner.show).toHaveBeenCalled();
      expect(mockKsmService.handleReAuthentication).not.toHaveBeenCalled();
      expect(mockStorageManager.setCurrentStorage).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during authentication', async () => {
      const error = new Error('Authentication failed');
      const mockConfigPath = '/path/to/config.json';
      mockKsmService.getStoreConfigPath.mockResolvedValue(mockConfigPath);
      mockKsmService.handleReAuthentication.mockRejectedValue(error);

      await ksmAuthenticateHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'KsmAuthenticateHandler: Failed to authenticate with Keeper Secrets Manager',
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        KSM_ERROR_MESSAGES.FAILED_TO_AUTHENTICATE
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors when getting config path', async () => {
      const error = new Error('Failed to get config path');
      mockKsmService.getStoreConfigPath.mockRejectedValue(error);

      await ksmAuthenticateHandler.execute();

      expect(logger.logError).toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        KSM_ERROR_MESSAGES.FAILED_TO_AUTHENTICATE
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should hide spinner in finally block even when error occurs', async () => {
      const error = new Error('Test error');
      mockKsmService.getStoreConfigPath.mockResolvedValue('/path/to/config.json');
      mockKsmService.handleReAuthentication.mockRejectedValue(error);

      await ksmAuthenticateHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });
});
