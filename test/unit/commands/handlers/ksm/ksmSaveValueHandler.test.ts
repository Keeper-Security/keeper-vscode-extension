import { window } from 'vscode';
import { KsmSaveValueHandler } from '../../../../../src/commands/handlers/ksm/ksmSaveValueHandler';
import { BaseSaveValueHandler } from '../../../../../src/commands/handlers/base/baseSaveValueHandler';
import { KsmService } from '../../../../../src/services/ksm';
import { KsmStorageManager } from '../../../../../src/commands/storage/ksmStorageManager';
import { StatusBarSpinner, createKeeperReference } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../../../src/utils/constants';
import { KSM_ERROR_MESSAGES, KSM_INFO_MESSAGES, KSM_LOGGER_DEBUG_MESSAGES, KSM_LOGGER_ERROR_MESSAGES } from '../../../../../src/utils/ksm-messages';

jest.mock('../../../../../src/services/ksm');
jest.mock('../../../../../src/commands/storage/ksmStorageManager');
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
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
  workspace: { openTextDocument: jest.fn() },
  Range: jest.fn().mockImplementation((sL, sC, eL, eC) => ({ start: { line: sL, character: sC }, end: { line: eL, character: eC } })),
  Uri: { file: jest.fn().mockImplementation((p: string) => ({ fsPath: p })) },
}));

const mockedCreateKeeperReference = createKeeperReference as unknown as jest.Mock;

describe('KsmSaveValueHandler', () => {
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockKsmService: jest.Mocked<KsmService>;
  let mockStorageManager: jest.Mocked<KsmStorageManager>;
  let handler: KsmSaveValueHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), updateMessage: jest.fn() } as any;
    mockKsmService = { isKsmReady: jest.fn(), executeKsmCommand: jest.fn(), createSecret: jest.fn(), getFolders: jest.fn() } as any;
    mockStorageManager = { ensureValidStorage: jest.fn(), getCurrentStorage: jest.fn() } as any;
    handler = new KsmSaveValueHandler(mockSpinner, mockKsmService, mockStorageManager);
  });

  const spyGetSelectedText = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getSelectedText');
  const spyGetRecordNameFromUser = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getRecordNameFromUser');
  const spyGetSecretFieldNameFromUser = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getSecretFieldNameFromUser');
  const spyGetFieldType = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'getFieldType');
  const spyInsert = () => jest.spyOn(BaseSaveValueHandler.prototype as any, 'insertKeeperRefInActiveTextEditor');

  it('saves secret and inserts reference (My Vault)', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
    spyGetFieldType().mockReturnValue('text');
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getFolders as jest.Mock).mockResolvedValue([{ folderUid: 'root' }]);
    (mockKsmService.createSecret as jest.Mock).mockResolvedValue('uid123');
    mockedCreateKeeperReference.mockReturnValue('keeper://uid123/custom_field/Field');
    spyInsert().mockResolvedValue(true);

    await handler.execute();

    expect(mockSpinner.show).toHaveBeenCalledWith(KSM_INFO_MESSAGES.SAVING_SECRET);
    expect(mockedCreateKeeperReference).toHaveBeenCalledWith('uid123', KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD, 'Field');
    expect(window.showInformationMessage).toHaveBeenCalled();
  });

  it('adds folder param when not My Vault', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: 'f1', name: 'Folder', parentUid: '/', folderPath: '/Folder' });
    spyGetFieldType().mockReturnValue('secret');
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getFolders as jest.Mock).mockResolvedValue([{ folderUid: 'root' }]);
    (mockKsmService.createSecret as jest.Mock).mockResolvedValue('uid');
    mockedCreateKeeperReference.mockReturnValue('keeper://uid/custom_field/Field');
    spyInsert().mockResolvedValue(true);

    await handler.execute();

    expect(window.showInformationMessage).toHaveBeenCalled();
  });

  it('early return when no selected text', async () => {
    spyGetSelectedText().mockResolvedValue(undefined);
    await handler.execute();
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.NO_VALUE_FOUND_TO_SAVE);
  });

  it('early return when record name cancelled', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue(undefined);
    await handler.execute();
    expect(logger.logDebug).toHaveBeenCalledWith(expect.stringContaining(KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT));
  });

  it('early return when field name cancelled', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue(undefined);
    await handler.execute();
    expect(logger.logDebug).toHaveBeenCalledWith(expect.stringContaining(KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION));
  });

  it('early return when storage invalid', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
    mockStorageManager.ensureValidStorage.mockResolvedValue(false);
    await handler.execute();
    expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
  });

  it('handles createKeeperReference returning null', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    (mockKsmService.isKsmReady as jest.Mock).mockResolvedValue(true);
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
    spyGetFieldType().mockReturnValue('text');
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getFolders as jest.Mock).mockResolvedValue([{ folderUid: 'root' }]);
    (mockKsmService.createSecret as jest.Mock).mockResolvedValue('uid');
    mockedCreateKeeperReference.mockReturnValue(null);
    await handler.execute();
    expect(logger.logError).toHaveBeenCalledWith('KsmSaveValueHandler: ' + KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE + '- Rec');
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET);
  });

  it('does not show success when insert fails', async () => {
    spyGetSelectedText().mockResolvedValue('value');
    spyGetRecordNameFromUser().mockResolvedValue('Rec');
    spyGetSecretFieldNameFromUser().mockResolvedValue('Field');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
    spyGetFieldType().mockReturnValue('text');
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.createSecret as jest.Mock).mockResolvedValue('uid');
    mockedCreateKeeperReference.mockReturnValue('keeper://uid/custom_field/Field');
    jest.spyOn(BaseSaveValueHandler.prototype as any, 'insertKeeperRefInActiveTextEditor').mockResolvedValue(false);
    await handler.execute();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });
});


