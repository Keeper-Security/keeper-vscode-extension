import { ExtensionContext, window } from 'vscode';
import { KsmRunSecurelyHandler } from '../../../../../src/commands/handlers/ksm/ksmRunSecurelyHandler';
import { BaseRunSecurelyHandler } from '../../../../../src/commands/handlers/base/baseRunSecurelyHandler';
import { KsmService } from '../../../../../src/services/ksm';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { KSM_ERROR_MESSAGES, KSM_LOGGER_ERROR_MESSAGES } from '../../../../../src/utils/ksm-messages';

jest.mock('../../../../../src/services/ksm');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  StatusBarSpinner: jest.fn(),
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
}));

describe('KsmRunSecurelyHandler', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockKsmService: jest.Mocked<KsmService>;
  let handler: KsmRunSecurelyHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = {} as ExtensionContext;
    mockSpinner = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), updateMessage: jest.fn() } as any;
    mockKsmService = { isKsmReady: jest.fn(), executeKsmCommand: jest.fn(), getSecretByRecordUid: jest.fn() } as any;
    handler = new KsmRunSecurelyHandler(mockContext, mockSpinner, mockKsmService);
  });

  it('returns early when KSM not ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(false);
    await handler.execute();
    expect(logger.logError).toHaveBeenCalledWith('KsmRunSecurelyHandler: ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('calls executeRunSecurely with callback when KSM ready', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    const execSpy = jest.spyOn(BaseRunSecurelyHandler.prototype as any, 'executeRunSecurely').mockResolvedValue(undefined);
    await handler.execute();
    expect(execSpy).toHaveBeenCalled();
  });

  it('handles executeRunSecurely errors', async () => {
    mockKsmService.isKsmReady.mockResolvedValue(true);
    jest.spyOn(BaseRunSecurelyHandler.prototype as any, 'executeRunSecurely').mockRejectedValue(new Error('err'));
    await handler.execute();
    expect(logger.logError).toHaveBeenCalledWith('KsmRunSecurelyHandler: ' + KSM_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY, expect.any(Error));
    expect(window.showErrorMessage).toHaveBeenCalledWith(KSM_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY);
    expect(mockSpinner.hide).toHaveBeenCalled();
  });

  it('fetchSecretByRecordUid parses and returns first record', async () => {
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getSecretByRecordUid as jest.Mock).mockResolvedValue({ records: [{ data: 1 }] });
    const result = await (handler as any).fetchSecretByRecordUid('abc');
    expect(mockKsmService.executeKsmCommand).toHaveBeenCalled();
    expect(mockKsmService.getSecretByRecordUid).toHaveBeenCalledWith('abc');
    expect(result).toEqual(1);
  });

  it('fetchSecretByRecordUid throws when empty', async () => {
    (mockKsmService.executeKsmCommand as jest.Mock).mockImplementation(async (cb: any) => cb());
    (mockKsmService.getSecretByRecordUid as jest.Mock).mockResolvedValue({ records: [] });
    await expect((handler as any).fetchSecretByRecordUid('abc')).rejects.toThrow();
  });
});


