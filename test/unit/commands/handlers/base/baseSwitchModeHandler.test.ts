import { commands, window } from 'vscode';
import { BaseSwitchModeHandler } from '../../../../../src/commands/handlers/base/baseSwitchModeHandler';
import { ModeType, Mode } from '../../../../../src/types';
import { RELOAD_WINDOW } from '../../../../../src/utils/constants';
import { getSwitchModeMessage } from '../../../../../src/utils/helper';
import { ModeManager } from '../../../../../src/services/managers/modeManager';

// Mock dependencies
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  getSwitchModeMessage: jest.fn(),
}));
jest.mock('../../../../../src/services/managers/modeManager');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
    })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
}));

// Create a concrete implementation for testing
class TestSwitchModeHandler extends BaseSwitchModeHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseSwitchModeHandler', () => {
  let handler: TestSwitchModeHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestSwitchModeHandler();
  });

  describe('switchMode', () => {
    it('should switch mode and reload window when user confirms', async () => {
      const mode: Mode = ModeType.CLI;
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.switchMode(mode);

      expect(getSwitchModeMessage).toHaveBeenCalledWith(mode);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        mockMessage,
        { modal: true },
        RELOAD_WINDOW
      );
      expect(ModeManager.setMode).toHaveBeenCalledWith(mode);
      expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    it('should not reload window when user cancels', async () => {
      const mode: Mode = ModeType.KSM;
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      await handler.switchMode(mode);

      expect(getSwitchModeMessage).toHaveBeenCalledWith(mode);
      expect(window.showInformationMessage).toHaveBeenCalled();
      expect(ModeManager.setMode).not.toHaveBeenCalled();
      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should not reload window when user selects different action', async () => {
      const mode: Mode = ModeType.CLI;
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue('Cancel');

      await handler.switchMode(mode);

      expect(ModeManager.setMode).not.toHaveBeenCalled();
      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle errors from setMode', async () => {
      const mode: Mode = ModeType.KSM;
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockRejectedValue(new Error('Failed to set mode'));

      await expect(handler.switchMode(mode)).rejects.toThrow('Failed to set mode');

      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle errors from reload command', async () => {
      const mode: Mode = ModeType.CLI;
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockRejectedValue(new Error('Failed to reload'));

      await expect(handler.switchMode(mode)).rejects.toThrow('Failed to reload');
    });

    it('should work with CLI mode', async () => {
      const mode: Mode = ModeType.CLI;
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.switchMode(mode);

      expect(ModeManager.setMode).toHaveBeenCalledWith(ModeType.CLI);
    });

    it('should work with KSM mode', async () => {
      const mode: Mode = ModeType.KSM;
      const mockMessage = 'Mode switched to ksm. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.switchMode(mode);

      expect(ModeManager.setMode).toHaveBeenCalledWith(ModeType.KSM);
    });
  });
});
