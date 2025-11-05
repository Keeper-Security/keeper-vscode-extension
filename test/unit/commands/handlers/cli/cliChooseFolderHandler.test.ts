import { window } from 'vscode';
import { CliChooseFolderHandler } from '../../../../../src/commands/handlers/cli/cliChooseFolderHandler';
import { CliService } from '../../../../../src/services/cli';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../../../src/utils/cli-messages';

// Mock dependencies
jest.mock('../../../../../src/services/cli');
jest.mock('../../../../../src/commands/storage/cliStorageManager');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper');
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

describe('CliChooseFolderHandler', () => {
  let mockCliService: jest.Mocked<CliService>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockStorageManager: jest.Mocked<CliStorageManager>;
  let cliChooseFolderHandler: CliChooseFolderHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCliService = {
      isCLIReady: jest.fn(),
    } as unknown as jest.Mocked<CliService>;

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockStorageManager = {
      chooseFolder: jest.fn(),
      fetchAvailableFolders: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;

    cliChooseFolderHandler = new CliChooseFolderHandler(
      mockSpinner,
      mockCliService,
      mockStorageManager
    );
  });

  describe('constructor', () => {
    it('should initialize with spinner, cliService, and storageManager', () => {
      expect(cliChooseFolderHandler).toBeInstanceOf(CliChooseFolderHandler);
      const handler = new CliChooseFolderHandler(
        mockSpinner,
        mockCliService,
        mockStorageManager
      );
      expect(handler).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute successfully when CLI is ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.chooseFolder.mockResolvedValue();

      await cliChooseFolderHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockSpinner.show).toHaveBeenCalledWith(CLI_INFO_MESSAGES.RETRIEVING_FOLDERS);
      expect(mockStorageManager.chooseFolder).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliChooseFolderHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'CliChooseFolderHandler: ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
      );
      expect(mockSpinner.show).not.toHaveBeenCalled();
      expect(mockStorageManager.chooseFolder).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should call chooseFolder with bound fetchAvailableFolders', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.chooseFolder.mockResolvedValue();

      await cliChooseFolderHandler.execute();

      expect(mockStorageManager.chooseFolder).toHaveBeenCalledWith(
        expect.any(Function)
      );

      // Verify a function was passed (bound function from fetchAvailableFolders)
      const boundFunction = mockStorageManager.chooseFolder.mock.calls[0][0];
      expect(typeof boundFunction).toBe('function');
      
      // Verify it can be called (it's a bound method)
      const mockFolders = { availableFolders: [], rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' } };
      mockStorageManager.fetchAvailableFolders.mockResolvedValue(mockFolders);
      await boundFunction();
      expect(mockStorageManager.fetchAvailableFolders).toHaveBeenCalled();
    });

    it('should handle errors during folder selection', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      const error = new Error('Failed to fetch folders');
      mockStorageManager.chooseFolder.mockRejectedValue(error);

      await cliChooseFolderHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        `CliChooseFolderHandler: ${CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER}`,
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during isCLIReady check', async () => {
      const error = new Error('CLI service error');
      mockCliService.isCLIReady.mockRejectedValue(error);

      await cliChooseFolderHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        `CliChooseFolderHandler: ${CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER}`,
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should always hide spinner in finally block', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.chooseFolder.mockResolvedValue();

      await cliChooseFolderHandler.execute();

      // Verify spinner.hide is called exactly once
      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should hide spinner even when error occurs', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.chooseFolder.mockRejectedValue(new Error('Test error'));

      await cliChooseFolderHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should hide spinner even when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliChooseFolderHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should return the result from chooseFolder', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      const expectedResult = undefined;
      mockStorageManager.chooseFolder.mockResolvedValue(expectedResult);

      const result = await cliChooseFolderHandler.execute();

      expect(result).toBe(expectedResult);
    });

    it('should not show spinner when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliChooseFolderHandler.execute();

      expect(mockSpinner.show).not.toHaveBeenCalled();
    });

    it('should show spinner before choosing folder', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.chooseFolder.mockResolvedValue();

      await cliChooseFolderHandler.execute();

      // Verify both were called and check order by call indices
      expect(mockSpinner.show).toHaveBeenCalled();
      expect(mockStorageManager.chooseFolder).toHaveBeenCalled();
      const showCallOrder = (mockSpinner.show as jest.Mock).mock.invocationCallOrder[0];
      const chooseFolderCallOrder = (mockStorageManager.chooseFolder as jest.Mock).mock.invocationCallOrder[0];
      expect(showCallOrder).toBeLessThan(chooseFolderCallOrder);
    });
  });
});

