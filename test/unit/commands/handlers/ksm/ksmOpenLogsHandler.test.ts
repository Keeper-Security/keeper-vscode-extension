import { KsmOpenLogsHandler } from '../../../../../src/commands/handlers/ksm/ksmOpenLogsHandler';
import { BaseOpenLogsHandler } from '../../../../../src/commands/handlers/base/baseOpenLogsHandler';
import { logger } from '../../../../../src/utils/logger';

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

describe('KsmOpenLogsHandler', () => {
  let handler: KsmOpenLogsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new KsmOpenLogsHandler();
  });

  it('constructs', () => {
    expect(handler).toBeInstanceOf(KsmOpenLogsHandler);
  });

  it('execute calls showLogs', async () => {
    const spy = jest.spyOn(BaseOpenLogsHandler.prototype as any, 'showLogs').mockResolvedValue(undefined);
    await handler.execute();
    expect(spy).toHaveBeenCalled();
  });

  it('showLogs calls logger.show', async () => {
    await (handler as unknown as BaseOpenLogsHandler).showLogs();
    expect(logger.show).toHaveBeenCalled();
  });
});


