import { ExtensionContext, window } from 'vscode';
import { CliRunSecurelyHandler } from '../../../../../src/commands/handlers/cli/cliRunSecurelyHandler';
import { BaseRunSecurelyHandler } from '../../../../../src/commands/handlers/base/baseRunSecurelyHandler';
import { CliService } from '../../../../../src/services/cli';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { IRecordData } from '../../../../../src/types/ksm';
import { safeJsonParse } from '../../../../../src/utils/helper';
import { CLI_ERROR_MESSAGES, CLI_LOGGER_ERROR_MESSAGES } from '../../../../../src/utils/cli-messages';

// Mocks
jest.mock('../../../../../src/services/cli');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  StatusBarSpinner: jest.fn(),
  safeJsonParse: jest.fn(),
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showErrorMessage: jest.fn(),
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

describe('CliRunSecurelyHandler', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockCliService: jest.Mocked<CliService>;
  let handler: CliRunSecurelyHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {} as ExtensionContext;
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

    handler = new CliRunSecurelyHandler(mockContext, mockSpinner, mockCliService);
  });

  describe('constructor', () => {
    it('should initialize with context, spinner and cliService', () => {
      expect(handler).toBeInstanceOf(CliRunSecurelyHandler);
    });
  });

  describe('execute', () => {
    it('should return early when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await handler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'CliRunSecurelyHandler: ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should call executeRunSecurely with bound fetchSecretByRecordUid when CLI is ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      const execSpy = jest
        .spyOn(BaseRunSecurelyHandler.prototype as any, 'executeRunSecurely')
        .mockResolvedValue(undefined);

      await handler.execute();

      expect(execSpy).toHaveBeenCalledTimes(1);
      const arg = (execSpy as jest.Mock).mock.calls[0][0];
      expect(typeof arg).toBe('function');
      // Call the provided callback to ensure it is callable (will attempt cliService.get)
      mockCliService.executeCommanderCommand.mockResolvedValue('[]');
      (safeJsonParse as jest.Mock).mockReturnValue([{}]);
      await arg('record123');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('get', [
        'record123',
        '--format=json',
      ]);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors from executeRunSecurely and show error message', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      const execSpy = jest
        .spyOn(BaseRunSecurelyHandler.prototype as any, 'executeRunSecurely')
        .mockRejectedValue(new Error('boom'));

      await handler.execute();

      expect(execSpy).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'CliRunSecurelyHandler: ' + CLI_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY,
        expect.any(Error)
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(CLI_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });

  describe('fetchSecretByRecordUid (private via cast)', () => {
    it('should fetch and parse record data and return first entry', async () => {
      mockCliService.executeCommanderCommand.mockResolvedValue('[{"data":1}]');
      (safeJsonParse as jest.Mock).mockReturnValue([{ data: 1 }] as unknown as IRecordData[]);

      const result = await (handler as any).fetchSecretByRecordUid('abc');

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('get', [
        'abc',
        '--format=json',
      ]);
      expect(result).toEqual({ data: 1 });
    });

    it('should throw when parsed array is empty', async () => {
      mockCliService.executeCommanderCommand.mockResolvedValue('[]');
      (safeJsonParse as jest.Mock).mockReturnValue([]);

      await expect((handler as any).fetchSecretByRecordUid('abc')).rejects.toThrow(
        'Failed to fetch record data'
      );
    });
  });
});


