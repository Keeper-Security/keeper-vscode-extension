import { window, commands, ExtensionContext } from 'vscode';
import { SwitchToKsmHandler } from '../../../../../src/commands/handlers/cli/switchToKsmHandler';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { ModeType } from '../../../../../src/types';
import { logger } from '../../../../../src/utils/logger';
import { CLI_ERROR_MESSAGES } from '../../../../../src/utils/cli-messages';
import { RELOAD_WINDOW } from '../../../../../src/utils/constants';
import { getSwitchModeMessage } from '../../../../../src/utils/helper';
import { ModeManager } from '../../../../../src/services/managers/modeManager';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  getSwitchModeMessage: jest.fn(),
}));
jest.mock('../../../../../src/services/managers/modeManager');
jest.mock('../../../../../src/commands/storage/cliStorageManager');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
}));

describe('SwitchToKsmHandler', () => {
  let mockContext: ExtensionContext;
  let mockStorageManager: jest.Mocked<CliStorageManager>;
  let switchToKsmHandler: SwitchToKsmHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as ExtensionContext;

    mockStorageManager = {
      setCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;

    switchToKsmHandler = new SwitchToKsmHandler(mockContext, mockStorageManager);
  });

  describe('constructor', () => {
    it('should initialize with storage manager', () => {
      expect(switchToKsmHandler).toBeInstanceOf(SwitchToKsmHandler);
      const handler = new SwitchToKsmHandler(mockContext, mockStorageManager);
      expect(handler).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should switch to KSM mode successfully when user confirms', async () => {
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await switchToKsmHandler.execute();
      
      // Wait for switchMode promise to complete (it's not awaited in execute)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(getSwitchModeMessage).toHaveBeenCalledWith(ModeType.KSM);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        mockMessage,
        { modal: true },
        RELOAD_WINDOW
      );
      expect(ModeManager.setMode).toHaveBeenCalledWith(mockContext, ModeType.KSM);
      expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    it('should not reload window when user cancels', async () => {
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      await switchToKsmHandler.execute();

      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(ModeManager.setMode).not.toHaveBeenCalled();
      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle errors and show error message', async () => {
      const error = new Error('Test error');
      mockStorageManager.setCurrentStorage.mockImplementation(() => {
        throw error;
      });

      await switchToKsmHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'SwitchToKsmHandler: Failed to switch to KSM mode',
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_KSM
      );
    });

    it('should clear storage before attempting to switch mode', async () => {
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      // Track call order
      const callOrder: string[] = [];
      mockStorageManager.setCurrentStorage.mockImplementation(() => {
        callOrder.push('setCurrentStorage');
      });
      (ModeManager.setMode as jest.Mock).mockImplementation(async () => {
        callOrder.push('setMode');
      });

      await switchToKsmHandler.execute();
      
      // Wait for switchMode promise to complete (it's not awaited in execute)
      await new Promise(resolve => setImmediate(resolve));

      // Verify storage is cleared before switchMode is attempted
      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(callOrder[0]).toBe('setCurrentStorage');
    });
  });
});
