import { window } from 'vscode';
import { KsmGeneratePasswordHandler } from '../../../../../src/commands/handlers/ksm/ksmGeneratePasswordHandler';
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

const mockedCreateKeeperReference = createKeeperReference as unknown as jest.Mock;

describe('KsmGeneratePasswordHandler', () => {
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockKsmService: jest.Mocked<KsmService>;
  let mockStorageManager: jest.Mocked<KsmStorageManager>;
  let handler: KsmGeneratePasswordHandler;
  let mockActiveEditor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), updateMessage: jest.fn() } as any;
    mockKsmService = { isKsmReady: jest.fn(), executeKsmCommand: jest.fn(), getFolders: jest.fn() } as any;
    mockStorageManager = { ensureValidStorage: jest.fn(), getCurrentStorage: jest.fn() } as any;
    handler = new KsmGeneratePasswordHandler(mockSpinner, mockKsmService, mockStorageManager);
    mockActiveEditor = { edit: jest.fn().mockResolvedValue(true), document: { fileName: 'file.txt' }, selection: { active: { line: 0, character: 0 } } };
  });

  it('returns early when KSM not ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(false);
    await handler.execute();
    expect(logger.logError).toHaveBeenCalledWith('KsmGeneratePasswordHandler: ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('returns early when record name cancelled', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (window.showInputBox as jest.Mock).mockResolvedValue(undefined);
    await handler.execute();
    expect(logger.logDebug).toHaveBeenCalledWith('KsmGeneratePasswordHandler: ' + KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT);
  });

  it('returns early when storage invalid', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (window.showInputBox as jest.Mock).mockResolvedValue('Rec');
    mockStorageManager.ensureValidStorage.mockResolvedValue(false);
    await handler.execute();
    expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
  });

  it('generates password and inserts reference (My Vault)', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (window.showInputBox as jest.Mock).mockResolvedValue('Rec');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
    mockKsmService.getFolders = jest.fn().mockResolvedValue([{ folderUid: 'root-folder' }]) as any;

    const recordUid = 'uid123';
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    mockKsmService.createSecret = jest.fn().mockResolvedValue(recordUid) as any;

    mockedCreateKeeperReference.mockReturnValue('keeper://uid123/field/password');
    (window.activeTextEditor as any) = mockActiveEditor;

    await handler.execute();

    expect(mockSpinner.show).toHaveBeenCalledWith(KSM_INFO_MESSAGES.GENERATING_PASSWORD);
    expect(mockedCreateKeeperReference).toHaveBeenCalledWith(recordUid.trim(), KEEPER_NOTATION_FIELD_TYPES.FIELD, 'password');
    expect(window.showInformationMessage).toHaveBeenCalled();
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('handles keeper reference creation failure', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (window.showInputBox as jest.Mock).mockResolvedValue('Rec');
    mockStorageManager.ensureValidStorage.mockResolvedValue(true);
    mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
    mockKsmService.getFolders = jest.fn().mockResolvedValue([{ folderUid: 'root-folder' }]) as any;
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    mockKsmService.createSecret = jest.fn().mockResolvedValue('uid123') as any;
    mockedCreateKeeperReference.mockReturnValue(null);

    await handler.execute();

    expect(logger.logError).toHaveBeenCalledWith(
      'KsmGeneratePasswordHandler: ' + KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE + '- Rec'
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });
});


