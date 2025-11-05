import { window } from 'vscode';
import { KsmChooseFolderHandler } from '../../../../../src/commands/handlers/ksm/ksmChooseFolderHandler';
import { KsmService } from '../../../../../src/services/ksm';
import { KsmStorageManager } from '../../../../../src/commands/storage/ksmStorageManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KSM_ERROR_MESSAGES, KSM_INFO_MESSAGES, KSM_LOGGER_ERROR_MESSAGES } from '../../../../../src/utils/ksm-messages';

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

describe('KsmChooseFolderHandler', () => {
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockKsmService: jest.Mocked<KsmService>;
  let mockStorageManager: jest.Mocked<KsmStorageManager>;
  let handler: KsmChooseFolderHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), updateMessage: jest.fn() } as any;
    mockKsmService = { isKsmReady: jest.fn(), executeKsmCommand: jest.fn(), getFolders: jest.fn() } as any;
    mockStorageManager = { chooseFolder: jest.fn(), fetchAvailableFolders: jest.fn() } as any;
    handler = new KsmChooseFolderHandler(mockSpinner, mockKsmService, mockStorageManager);
  });

  it('returns early when KSM not ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(false);

    await handler.execute();

    expect(logger.logError).toHaveBeenCalledWith(
      'KsmChooseFolderHandler: ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY
    );
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('shows spinner and calls chooseFolder when KSM ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    mockStorageManager.chooseFolder.mockResolvedValue(undefined);

    await handler.execute();

    expect(mockSpinner.show).toHaveBeenCalledWith(KSM_INFO_MESSAGES.RETRIEVING_FOLDERS);
    expect(mockStorageManager.chooseFolder).toHaveBeenCalledWith(
      expect.any(Function)
    );
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('handles errors during chooseFolder', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    mockStorageManager.chooseFolder.mockRejectedValue(new Error('fail'));

    await handler.execute();

    expect(logger.logError).toHaveBeenCalledWith(
      'KsmChooseFolderHandler: ' + KSM_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER,
      expect.any(Error)
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });
});


