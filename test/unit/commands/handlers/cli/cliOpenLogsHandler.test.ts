import { CliOpenLogsHandler } from '../../../../../src/commands/handlers/cli/cliOpenLogsHandler';
import { BaseOpenLogsHandler } from '../../../../../src/commands/handlers/base/baseOpenLogsHandler';
import { logger } from '../../../../../src/utils/logger';

// Mocks
jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    show: jest.fn(),
    logDebug: jest.fn(),
    logError: jest.fn(),
  },
}));

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
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

describe('CliOpenLogsHandler', () => {
  let handler: CliOpenLogsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new CliOpenLogsHandler();
  });

  it('should construct successfully', () => {
    expect(handler).toBeInstanceOf(CliOpenLogsHandler);
  });

  it('execute should call showLogs', async () => {
    const showLogsSpy = jest.spyOn(BaseOpenLogsHandler.prototype as any, 'showLogs').mockResolvedValue(undefined);

    await handler.execute();

    expect(showLogsSpy).toHaveBeenCalledTimes(1);
  });

  it('showLogs should call logger.show (via base class)', async () => {
    await (handler as unknown as BaseOpenLogsHandler).showLogs();

    expect(logger.show).toHaveBeenCalledTimes(1);
  });
});
