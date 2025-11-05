import { window } from 'vscode';
import { CliSaveValueHandler } from '../../../../../src/commands/handlers/cli/cliSaveValueHandler';
import { BaseSaveValueHandler } from '../../../../../src/commands/handlers/base/baseSaveValueHandler';
import { CliService } from '../../../../../src/services/cli';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { StatusBarSpinner, createKeeperReference } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KEEPER_NOTATION_FIELD_TYPES, KEEPER_RECORD_TYPES } from '../../../../../src/utils/constants';
import { CLI_ERROR_MESSAGES, CLI_INFO_MESSAGES, CLI_LOGGER_DEBUG_MESSAGES, CLI_LOGGER_ERROR_MESSAGES } from '../../../../../src/utils/cli-messages';

// Mocks
jest.mock('../../../../../src/services/cli');
jest.mock('../../../../../src/commands/storage/cliStorageManager');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  createKeeperReference: jest.fn(),
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showTextDocument: jest.fn(),
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
  workspace: {
    openTextDocument: jest.fn(),
  },
  Range: jest.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  })),
  Uri: {
    file: jest.fn().mockImplementation((path: string) => ({ fsPath: path })),
  },
}));

const mockedCreateKeeperReference = createKeeperReference as unknown as jest.Mock;

describe('CliSaveValueHandler', () => {
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockCliService: jest.Mocked<CliService>;
  let mockStorageManager: jest.Mocked<CliStorageManager>;
  let handler: CliSaveValueHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockCliService = {
      isCLIReady: jest.fn(),
      executeCommanderCommand: jest.fn(),
    } as unknown as jest.Mocked<CliService>;

    mockStorageManager = {
      ensureValidStorage: jest.fn(),
      getCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;

    handler = new CliSaveValueHandler(mockSpinner, mockCliService, mockStorageManager);
  });

  const spyGetSelectedText = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getSelectedText');
  const spyGetRecordNameFromUser = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getRecordNameFromUser');
  const spyGetSecretFieldNameFromUser = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getSecretFieldNameFromUser');
  const spyGetFieldType = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getFieldType');
  const spyInsert = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'insertKeeperRefInActiveTextEditor');

  describe('execute', () => {
    it('should save to My Vault (no folder arg) and show success', async () => {
      spyGetSelectedText().mockResolvedValue('secret-value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('My Record');
      spyGetSecretFieldNameFromUser().mockResolvedValue('password');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
      spyGetFieldType().mockReturnValue('secret');
      mockCliService.executeCommanderCommand.mockResolvedValue('rec123');
      mockedCreateKeeperReference.mockReturnValue('keeper://rec123/field/password');
      spyInsert().mockResolvedValue(true);

      await handler.execute();

      expect(mockSpinner.show).toHaveBeenCalledWith(CLI_INFO_MESSAGES.SAVING_SECRET);
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        `--title="My Record"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"c.secret.password"="secret-value"`,
      ]);
      expect(mockedCreateKeeperReference).toHaveBeenCalledWith('rec123', KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD, 'password');
      expect(window.showInformationMessage).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should save to custom folder (adds --folder)', async () => {
      spyGetSelectedText().mockResolvedValue('secret-value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('My Record');
      spyGetSecretFieldNameFromUser().mockResolvedValue('apiKey');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: 'folder123', name: 'Custom', parentUid: '/', folderPath: '/Custom' });
      spyGetFieldType().mockReturnValue('secret');
      mockCliService.executeCommanderCommand.mockResolvedValue('rec123');
      mockedCreateKeeperReference.mockReturnValue('keeper://rec123/custom_field/apiKey');
      spyInsert().mockResolvedValue(true);

      await handler.execute();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        `--title="My Record"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"c.secret.apiKey"="secret-value"`,
        `--folder="folder123"`,
      ]);
      expect(window.showInformationMessage).toHaveBeenCalled();
    });

    it('should early return when no selected text', async () => {
      spyGetSelectedText().mockResolvedValue(undefined);

      await handler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.NO_VALUE_FOUND_TO_SAVE)
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(CLI_ERROR_MESSAGES.NO_VALUE_FOUND_TO_SAVE);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should early return when CLI not ready', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(false);

      await handler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'CliSaveValueHandler: ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should early return when record name cancelled', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue(undefined);

      await handler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should early return when field name cancelled', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('Rec');
      spyGetSecretFieldNameFromUser().mockResolvedValue(undefined);

      await handler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should early return when storage invalid', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('Rec');
      spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
      mockStorageManager.ensureValidStorage.mockResolvedValue(false);

      await handler.execute();

      expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
      expect(mockCliService.executeCommanderCommand).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle createKeeperReference returning null', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('Rec');
      spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
      spyGetFieldType().mockReturnValue('text');
      mockCliService.executeCommanderCommand.mockResolvedValue('rec789');
      mockedCreateKeeperReference.mockReturnValue(null);

      await handler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'CliSaveValueHandler: ' + CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE + '- Rec'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(CLI_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should not show success if insert fails', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('Rec');
      spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
      spyGetFieldType().mockReturnValue('text');
      mockCliService.executeCommanderCommand.mockResolvedValue('rec789');
      mockedCreateKeeperReference.mockReturnValue('keeper://rec789/custom_field/Field');
      spyInsert().mockResolvedValue(false);

      await handler.execute();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during CLI command', async () => {
      spyGetSelectedText().mockResolvedValue('value');
      mockCliService.isCLIReady.mockResolvedValue(true);
      spyGetRecordNameFromUser().mockResolvedValue('Rec');
      spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
      mockStorageManager.ensureValidStorage.mockResolvedValue(true);
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
      spyGetFieldType().mockReturnValue('text');
      mockCliService.executeCommanderCommand.mockRejectedValue(new Error('cmd failed'));

      await handler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        `CliSaveValueHandler: ${CLI_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET}`,
        expect.any(Error)
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(CLI_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should always hide spinner', async () => {
      spyGetSelectedText().mockResolvedValue(undefined);
      await handler.execute();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });
});


