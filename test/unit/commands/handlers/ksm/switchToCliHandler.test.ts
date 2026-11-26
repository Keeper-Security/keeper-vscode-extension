import { window, commands, ExtensionContext } from 'vscode';
import { SwitchToCliHandler } from '../../../../../src/commands/handlers/ksm/switchToCliHandler';
import { KsmStorageManager } from '../../../../../src/commands/storage/ksmStorageManager';
import { ModeType } from '../../../../../src/types';
import { logger } from '../../../../../src/utils/logger';
import { KSM_ERROR_MESSAGES } from '../../../../../src/utils/ksm-messages';
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
// Real file scans would depend on what's installed on the test machine
jest.mock('../../../../../src/services/managers/cliManager', () => ({
  CliManager: {
    findCandidates: jest.fn(),
    verifyCandidates: jest.fn(),
    getSavedChoice: jest.fn(),
    saveChoice: jest.fn(),
  },
}));
jest.mock('../../../../../src/commands/storage/ksmStorageManager');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  ProgressLocation: { Notification: 15 },
  window: {
    showQuickPick: jest.fn(),
    withProgress: jest.fn((_options: unknown, task: () => unknown) => task()),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
}));

// Default: no Keeper CLIs on disk, so Switch to CLI behaves exactly as before
beforeEach(() => {
  const { CliManager } = require('../../../../../src/services/managers/cliManager');
  (CliManager.findCandidates as jest.Mock).mockReturnValue([]);
});

describe('SwitchToCliHandler', () => {
  let mockContext: ExtensionContext;
  let mockStorageManager: jest.Mocked<KsmStorageManager>;
  let switchToCliHandler: SwitchToCliHandler;

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
    } as unknown as jest.Mocked<KsmStorageManager>;

    switchToCliHandler = new SwitchToCliHandler(mockContext, mockStorageManager);
  });

  describe('constructor', () => {
    it('should initialize with storage manager', () => {
      expect(switchToCliHandler).toBeInstanceOf(SwitchToCliHandler);
      const handler = new SwitchToCliHandler(mockContext, mockStorageManager);
      expect(handler).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should switch to CLI mode successfully when user confirms', async () => {
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);
      (commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await switchToCliHandler.execute();
      
      // Wait for switchMode promise to complete (it's not awaited in execute)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(getSwitchModeMessage).toHaveBeenCalledWith(ModeType.CLI);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        mockMessage,
        { modal: true },
        RELOAD_WINDOW
      );
      expect(ModeManager.setMode).toHaveBeenCalledWith(mockContext, ModeType.CLI);
      expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    it('should not reload window when user cancels', async () => {
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
      (getSwitchModeMessage as jest.Mock).mockReturnValue(mockMessage);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      await switchToCliHandler.execute();

      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(ModeManager.setMode).not.toHaveBeenCalled();
      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle errors and show error message', async () => {
      const error = new Error('Test error');
      mockStorageManager.setCurrentStorage.mockImplementation(() => {
        throw error;
      });

      await switchToCliHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'SwitchToCliHandler: Failed to switch to CLI mode',
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        KSM_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_CLI
      );
    });

    it('should clear storage before attempting to switch mode', async () => {
      const mockMessage = 'Mode switched to cli. Window reload is mandatory...';
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

      await switchToCliHandler.execute();
      
      // Wait for switchMode promise to complete (it's not awaited in execute)
      await new Promise(resolve => setImmediate(resolve));

      // Verify storage is cleared before switchMode is attempted
      expect(mockStorageManager.setCurrentStorage).toHaveBeenCalledWith(null);
      expect(callOrder[0]).toBe('setCurrentStorage');
    });
  });

  describe('choosing the Keeper CLI for CLI mode', () => {
    const { CliManager } = require('../../../../../src/services/managers/cliManager');
    const { CliFlavor } = require('../../../../../src/types');
    const commander = {
      path: '/usr/local/bin/keeper',
      realPath: '/usr/local/keepercommandercli/bin/keeper-commander',
      flavor: CliFlavor.COMMANDER,
      version: '18.1.9',
    };
    const smk = {
      path: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
      realPath: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
      flavor: CliFlavor.SMK,
      smkHost: 'keeper.example.com',
      version: '18.1.8',
    };

    // execute() doesn't await switchMode (existing behavior): let it settle
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    beforeEach(() => {
      (CliManager.findCandidates as jest.Mock).mockReturnValue([commander, smk]);
      (CliManager.verifyCandidates as jest.Mock).mockResolvedValue({ installs: [commander, smk], rejected: [] });
      (CliManager.getSavedChoice as jest.Mock).mockReturnValue(undefined);
      (CliManager.saveChoice as jest.Mock).mockResolvedValue(undefined);
      (getSwitchModeMessage as jest.Mock).mockReturnValue('Reload?');
    });

    it('asks which CLI when several work, and saves the pick before the reload', async () => {
      (window.showQuickPick as jest.Mock).mockImplementation(async (items: any[]) => items[1]);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);
      const order: string[] = [];
      (CliManager.saveChoice as jest.Mock).mockImplementation(async () => order.push('save'));
      (ModeManager.setMode as jest.Mock).mockImplementation(async () => order.push('setMode'));
      (commands.executeCommand as jest.Mock).mockImplementation(async () => order.push('reload'));

      await switchToCliHandler.execute();
      await settle();

      const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
      expect(items.map((i: any) => i.label)).toEqual([
        'Keeper Commander (18.1.9)',
        'Keeper SMK: keeper.example.com (18.1.8)',
      ]);
      expect(CliManager.saveChoice).toHaveBeenCalledWith(mockContext, smk);
      expect(order).toEqual(['save', 'setMode', 'reload']);
    });

    it('does not switch mode when the CLI picker is cancelled', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await switchToCliHandler.execute();
      await settle();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
      expect(CliManager.saveChoice).not.toHaveBeenCalled();
      expect(ModeManager.setMode).not.toHaveBeenCalled();
    });

    it('does not save the pick when the reload is cancelled', async () => {
      (window.showQuickPick as jest.Mock).mockImplementation(async (items: any[]) => items[0]);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      await switchToCliHandler.execute();
      await settle();

      expect(CliManager.saveChoice).not.toHaveBeenCalled();
      expect(ModeManager.setMode).not.toHaveBeenCalled();
    });

    it.each([
      ['one install on disk', [commander], [commander]],
      ['several on disk but only one works', [commander, smk], [commander]],
    ])('skips the picker with %s (as before)', async (_name, onDisk, working) => {
      (CliManager.findCandidates as jest.Mock).mockReturnValue(onDisk);
      (CliManager.verifyCandidates as jest.Mock).mockResolvedValue({ installs: working, rejected: [] });
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);

      await switchToCliHandler.execute();
      await settle();

      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(CliManager.saveChoice).not.toHaveBeenCalled();
      expect(ModeManager.setMode).toHaveBeenCalledWith(mockContext, ModeType.CLI);
    });

    it('does not run any CLI when only one is on disk', async () => {
      (CliManager.findCandidates as jest.Mock).mockReturnValue([commander]);
      (window.showInformationMessage as jest.Mock).mockResolvedValue(RELOAD_WINDOW);

      await switchToCliHandler.execute();
      await settle();

      expect(CliManager.verifyCandidates).not.toHaveBeenCalled();
    });
  });
});
