import { window } from 'vscode';
import { CliGeneratePasswordHandler } from '../../../../../src/commands/handlers/cli/cliGeneratePasswordHandler';
import { CliService } from '../../../../../src/services/cli';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../../../src/utils/cli-messages';
import { KEEPER_NOTATION_FIELD_TYPES, KEEPER_RECORD_TYPES } from '../../../../../src/utils/constants';

// Mock dependencies
jest.mock('../../../../../src/services/cli');
jest.mock('../../../../../src/commands/storage/cliStorageManager');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  createKeeperReference: jest.fn(),
  commonInputBoxOptions: {
    ignoreFocusOut: true,
    validateInput: undefined,
  },
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    activeTextEditor: null,
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

// Get mocked functions
const { createKeeperReference } = require('../../../../../src/utils/helper');

describe('CliGeneratePasswordHandler', () => {
  let mockCliService: jest.Mocked<CliService>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockStorageManager: jest.Mocked<CliStorageManager>;
  let cliGeneratePasswordHandler: CliGeneratePasswordHandler;
  let mockActiveTextEditor: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCliService = {
      isCLIReady: jest.fn(),
      executeCommanderCommand: jest.fn(),
    } as unknown as jest.Mocked<CliService>;

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockStorageManager = {
      ensureValidStorage: jest.fn(),
      getCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;

    mockActiveTextEditor = {
      document: {
        uri: { fsPath: '/test/file.txt' },
        fileName: 'file.txt',
      },
      selection: {
        active: { line: 0, character: 0 },
      },
      edit: jest.fn().mockResolvedValue(true),
    };

    cliGeneratePasswordHandler = new CliGeneratePasswordHandler(
      mockSpinner,
      mockCliService,
      mockStorageManager
    );

    // Reset mocks
    (createKeeperReference as jest.Mock).mockReset();
  });

  describe('constructor', () => {
    it('should initialize with spinner, cliService, and storageManager', () => {
      expect(cliGeneratePasswordHandler).toBeInstanceOf(CliGeneratePasswordHandler);
      const handler = new CliGeneratePasswordHandler(
        mockSpinner,
        mockCliService,
        mockStorageManager
      );
      expect(handler).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute successfully with My Vault folder', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';
      const keeperRef = 'keeper://record123/field/password';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGeneratePasswordHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(window.showInputBox).toHaveBeenCalled();
      expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
      expect(mockSpinner.show).toHaveBeenCalledWith(CLI_INFO_MESSAGES.GENERATING_PASSWORD);
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        `--title="${recordName}"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"password"=$GEN`,
      ]);
      expect(createKeeperReference).toHaveBeenCalledWith(
        recordUid.trim(),
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'password'
      );
      expect(mockActiveTextEditor.edit).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should execute successfully with custom folder', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';
      const keeperRef = 'keeper://record123/field/password';
      const folderUid = 'folder123';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid,
        name: 'Custom Folder',
        parentUid: '/',
        folderPath: '/Custom Folder',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGeneratePasswordHandler.execute();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        `--title="${recordName}"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"password"=$GEN`,
        `--folder="${folderUid}"`,
      ]);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliGeneratePasswordHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'CliGeneratePasswordHandler: ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
      );
      expect(window.showInputBox).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when user cancels record name input', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        'CliGeneratePasswordHandler: ' +
          CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT
      );
      expect(mockStorageManager.ensureValidStorage).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when storage validation fails', async () => {
      const recordName = 'Test Record';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(false);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        'CliGeneratePasswordHandler: ' + CLI_LOGGER_DEBUG_MESSAGES.ENSURING_VALID_STORAGE
      );
      expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
      expect(mockCliService.executeCommanderCommand).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should throw error when createKeeperReference returns null', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(null);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'CliGeneratePasswordHandler: ' +
          CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
          `- ${recordName}`
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should throw error when createKeeperReference returns undefined', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(undefined);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logError).toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should not show success message when insert fails', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';
      const keeperRef = 'keeper://record123/field/password';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = null; // No active editor

      await cliGeneratePasswordHandler.execute();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should show success message when insert succeeds', async () => {
      const recordName = 'Test Record';
      const recordUid = 'record123';
      const keeperRef = 'keeper://record123/field/password';
      const folderName = 'Custom Folder';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: 'folder123',
        name: folderName,
        parentUid: '/',
        folderPath: '/Custom Folder',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGeneratePasswordHandler.execute();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining(folderName)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during CLI command execution', async () => {
      const recordName = 'Test Record';
      const error = new Error('CLI command failed');

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockRejectedValue(error);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        `CliGeneratePasswordHandler: ${CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`,
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during storage validation', async () => {
      const recordName = 'Test Record';
      const error = new Error('Storage validation failed');

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockRejectedValue(error);

      await cliGeneratePasswordHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        `CliGeneratePasswordHandler: ${CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`,
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should always hide spinner in finally block', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue('Test');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue('record123');
      (createKeeperReference as jest.Mock).mockReturnValue('keeper://ref');
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGeneratePasswordHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should hide spinner even when error occurs', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliGeneratePasswordHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should trim recordUid before creating keeper reference', async () => {
      const recordName = 'Test Record';
      const recordUid = '  record123  '; // With spaces
      const keeperRef = 'keeper://record123/field/password';

      mockCliService.isCLIReady.mockResolvedValue(true);
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      });
      mockCliService.executeCommanderCommand.mockResolvedValue(recordUid);
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGeneratePasswordHandler.execute();

      expect(createKeeperReference).toHaveBeenCalledWith(
        'record123', // Trimmed
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'password'
      );
    });
  });
});

