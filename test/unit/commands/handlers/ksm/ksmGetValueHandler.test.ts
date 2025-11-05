import { window } from 'vscode';
import { KsmGetValueHandler } from '../../../../../src/commands/handlers/ksm/ksmGetValueHandler';
import { KsmService } from '../../../../../src/services/ksm';
import { StatusBarSpinner, createKeeperReference } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../../../src/utils/constants';
import { IRecordQuickPick } from '../../../../../src/types/ksm';
import { KSM_ERROR_MESSAGES, KSM_LOGGER_DEBUG_MESSAGES, KSM_LOGGER_ERROR_MESSAGES, KSM_SUCCESS_MESSAGES } from '../../../../../src/utils/ksm-messages';

jest.mock('../../../../../src/services/ksm');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  createKeeperReference: jest.fn(),
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    activeTextEditor: null,
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
}));

const mockedCreateKeeperReference = createKeeperReference as unknown as jest.Mock;

describe('KsmGetValueHandler', () => {
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockKsmService: jest.Mocked<KsmService>;
  let handler: KsmGetValueHandler;
  let mockEditor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), updateMessage: jest.fn() } as any;
    mockKsmService = { isKsmReady: jest.fn(), executeKsmCommand: jest.fn(), getSecrets: jest.fn(), getSecretByRecordUid: jest.fn() } as any;
    handler = new KsmGetValueHandler(mockSpinner, mockKsmService);
    mockEditor = { edit: jest.fn().mockResolvedValue(true), document: { fileName: 'file.txt' }, selection: { active: { line: 0, character: 0 } } };
  });

  it('returns early when KSM not ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(false);
    await handler.execute();
    expect(logger.logError).toHaveBeenCalledWith('KsmGetValueHandler: ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('shows no records when list empty', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getSecrets as jest.Mock).mockResolvedValue({ records: [] });

    await handler.execute();

    expect(logger.logDebug).toHaveBeenCalledWith(expect.stringContaining(KSM_LOGGER_DEBUG_MESSAGES.NO_RECORDS_FOUND));
    expect(window.showInformationMessage).toHaveBeenCalledWith(KSM_SUCCESS_MESSAGES.NO_RECORDS_FOUND);
  });

  it('handles full flow and inserts reference', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getSecrets as jest.Mock).mockResolvedValue({ records: [{ recordUid: 'r1', data: { title: 'R1' } }] });
    const selectedRecord: IRecordQuickPick = { label: 'R1', value: 'r1' };
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(selectedRecord);
    (mockKsmService.getSecretByRecordUid as jest.Mock).mockResolvedValue({ records: [{ data: { fields: [{ type: 'login', label: 'Username', value: ['u'] }], custom: [{ type: 'text', label: 'Note', value: ['n'] }] } }] });
    const selectedField = { label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD };
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(selectedField);
    mockedCreateKeeperReference.mockReturnValue('keeper://r1/field/Username');
    (window.activeTextEditor as any) = mockEditor;

    await handler.execute();

    expect(window.showInformationMessage).toHaveBeenCalled();
  });

  it('handles createKeeperReference returning null', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getSecrets as jest.Mock).mockResolvedValue({ records: [{ recordUid: 'r1', data: { title: 'R1' } }] });
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({ label: 'R1', value: 'r1' });
    (mockKsmService.getSecretByRecordUid as jest.Mock).mockResolvedValue({ records: [{ data: { fields: [{ type: 'login', label: 'Username', value: ['u'] }], custom: [] } }] });
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({ label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD });
    mockedCreateKeeperReference.mockReturnValue(null);

    await handler.execute();

    expect(logger.logError).toHaveBeenCalledWith(
      expect.stringContaining(KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE),
      
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.FAILED_TO_GET_VALUE);
  });
});


