import { window } from 'vscode';
import { ModeManager } from '../../../../src/services/managers/modeManager';
import { configuration, ConfigurationKey } from '../../../../src/services/configurations';
import { Mode, ModeType } from '../../../../src/types';
import { commonQuickPickOptions } from '../../../../src/utils/helper';

// Mock dependencies
jest.mock('vscode', () => ({
  window: {
    showQuickPick: jest.fn(),
  },
}));

jest.mock('../../../../src/services/configurations', () => ({
  configuration: {
    get: jest.fn(),
    set: jest.fn(),
  },
  ConfigurationKey: {
    ModeType: 'mode.type',
  },
}));

jest.mock('../../../../src/utils/helper', () => ({
  commonQuickPickOptions: {
    ignoreFocusOut: true,
    matchOnDetail: true,
    matchOnDescription: true,
  },
}));

describe('ModeManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentMode', () => {
    it('should return the current mode from configuration', () => {
      const expectedMode: Mode = ModeType.CLI;
      (configuration.get as jest.Mock).mockReturnValue(expectedMode);

      const result = ModeManager.getCurrentMode();

      expect(result).toBe(expectedMode);
      expect(configuration.get).toHaveBeenCalledWith(ConfigurationKey.ModeType);
    });

    it('should return undefined when mode is not set', () => {
      (configuration.get as jest.Mock).mockReturnValue(undefined);

      const result = ModeManager.getCurrentMode();

      expect(result).toBeUndefined();
      expect(configuration.get).toHaveBeenCalledWith(ConfigurationKey.ModeType);
    });

    it('should return CLI mode when configured', () => {
      (configuration.get as jest.Mock).mockReturnValue(ModeType.CLI);

      const result = ModeManager.getCurrentMode();

      expect(result).toBe(ModeType.CLI);
    });

    it('should return KSM mode when configured', () => {
      (configuration.get as jest.Mock).mockReturnValue(ModeType.KSM);

      const result = ModeManager.getCurrentMode();

      expect(result).toBe(ModeType.KSM);
    });
  });

  describe('setMode', () => {
    it('should set the mode in configuration', async () => {
      const mode: Mode = ModeType.CLI;
      (configuration.set as jest.Mock).mockResolvedValue(undefined);

      await ModeManager.setMode(mode);

      expect(configuration.set).toHaveBeenCalledWith(ConfigurationKey.ModeType, mode);
    });

    it('should set CLI mode', async () => {
      (configuration.set as jest.Mock).mockResolvedValue(undefined);

      await ModeManager.setMode(ModeType.CLI);

      expect(configuration.set).toHaveBeenCalledWith(ConfigurationKey.ModeType, ModeType.CLI);
    });

    it('should set KSM mode', async () => {
      (configuration.set as jest.Mock).mockResolvedValue(undefined);

      await ModeManager.setMode(ModeType.KSM);

      expect(configuration.set).toHaveBeenCalledWith(ConfigurationKey.ModeType, ModeType.KSM);
    });

    it('should handle configuration set errors', async () => {
      const error = new Error('Configuration failed');
      (configuration.set as jest.Mock).mockRejectedValue(error);

      await expect(ModeManager.setMode(ModeType.CLI)).rejects.toThrow('Configuration failed');
      expect(configuration.set).toHaveBeenCalledWith(ConfigurationKey.ModeType, ModeType.CLI);
    });
  });

  describe('promptForModeSelection', () => {
    it('should show quick pick with CLI and KSM options', async () => {
      const selectedOption = {
        label: '$(terminal) Keeper Commander CLI',
        description: 'Use Keeper Commander CLI (requires CLI installation)',
        value: 'cli',
      };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedOption);

      const result = await ModeManager.promptForModeSelection();

      expect(window.showQuickPick).toHaveBeenCalledWith(
        [
          {
            label: '$(terminal) Keeper Commander CLI',
            description: 'Use Keeper Commander CLI (requires CLI installation)',
            value: 'cli',
          },
          {
            label: '$(cloud) Keeper Secrets Manager',
            description: 'Use Keeper Secrets Manager SDK (requires OTA token)',
            value: 'ksm',
          },
        ],
        {
          placeHolder: 'Choose your preferred Mode type',
          ...commonQuickPickOptions,
        }
      );
      expect(result).toBe('cli');
    });

    it('should return CLI mode when CLI option is selected', async () => {
      const selectedOption = {
        label: '$(terminal) Keeper Commander CLI',
        description: 'Use Keeper Commander CLI (requires CLI installation)',
        value: 'cli',
      };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedOption);

      const result = await ModeManager.promptForModeSelection();

      expect(result).toBe(ModeType.CLI);
    });

    it('should return KSM mode when KSM option is selected', async () => {
      const selectedOption = {
        label: '$(cloud) Keeper Secrets Manager',
        description: 'Use Keeper Secrets Manager SDK (requires OTA token)',
        value: 'ksm',
      };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedOption);

      const result = await ModeManager.promptForModeSelection();

      expect(result).toBe(ModeType.KSM);
    });

    it('should return undefined when user cancels selection', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await ModeManager.promptForModeSelection();

      expect(result).toBeUndefined();
      expect(window.showQuickPick).toHaveBeenCalled();
    });

    it('should include commonQuickPickOptions in quick pick', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await ModeManager.promptForModeSelection();

      const callArgs = (window.showQuickPick as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      
      expect(options.ignoreFocusOut).toBe(true);
      expect(options.matchOnDetail).toBe(true);
      expect(options.matchOnDescription).toBe(true);
      expect(options.placeHolder).toBe('Choose your preferred Mode type');
    });

    it('should handle showQuickPick errors', async () => {
      const error = new Error('Quick pick failed');
      (window.showQuickPick as jest.Mock).mockRejectedValue(error);

      await expect(ModeManager.promptForModeSelection()).rejects.toThrow('Quick pick failed');
    });

    it('should show correct option labels and descriptions', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await ModeManager.promptForModeSelection();

      const callArgs = (window.showQuickPick as jest.Mock).mock.calls[0];
      const items = callArgs[0];
      
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        label: '$(terminal) Keeper Commander CLI',
        description: 'Use Keeper Commander CLI (requires CLI installation)',
        value: 'cli',
      });
      expect(items[1]).toEqual({
        label: '$(cloud) Keeper Secrets Manager',
        description: 'Use Keeper Secrets Manager SDK (requires OTA token)',
        value: 'ksm',
      });
    });
  });

  describe('integration scenarios', () => {
    it('should get current mode after setting it', async () => {
      const mode: Mode = ModeType.KSM;
      (configuration.set as jest.Mock).mockResolvedValue(undefined);
      (configuration.get as jest.Mock).mockReturnValue(mode);

      await ModeManager.setMode(mode);
      const result = ModeManager.getCurrentMode();

      expect(result).toBe(mode);
    });

    it('should set mode after prompting user', async () => {
      const selectedOption = {
        label: '$(cloud) Keeper Secrets Manager',
        description: 'Use Keeper Secrets Manager SDK (requires OTA token)',
        value: 'ksm',
      };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedOption);
      (configuration.set as jest.Mock).mockResolvedValue(undefined);

      const selectedMode = await ModeManager.promptForModeSelection();
      if (selectedMode) {
        await ModeManager.setMode(selectedMode);
      }

      expect(selectedMode).toBe(ModeType.KSM);
      expect(configuration.set).toHaveBeenCalledWith(ConfigurationKey.ModeType, ModeType.KSM);
    });
  });
});
