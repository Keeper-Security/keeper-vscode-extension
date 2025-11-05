import { BaseOpenLogsHandler } from '../../../../../src/commands/handlers/base/baseOpenLogsHandler';
import { logger } from '../../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');

// Create a concrete implementation for testing
class TestOpenLogsHandler extends BaseOpenLogsHandler {
  async execute(): Promise<void> {
    await this.showLogs();
  }
}

describe('BaseOpenLogsHandler', () => {
  let handler: TestOpenLogsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestOpenLogsHandler();
  });

  describe('showLogs', () => {
    it('should call logger.show', async () => {
      (logger.show as jest.Mock).mockResolvedValue(undefined);

      await handler.showLogs();

      expect(logger.show).toHaveBeenCalled();
    });

    it('should handle errors from logger.show', async () => {
      const error = new Error('Failed to show logs');
      (logger.show as jest.Mock).mockRejectedValue(error);

      await expect(handler.showLogs()).rejects.toThrow('Failed to show logs');
    });
  });

  describe('execute', () => {
    it('should call showLogs when execute is called', async () => {
      (logger.show as jest.Mock).mockResolvedValue(undefined);

      await handler.execute();

      expect(logger.show).toHaveBeenCalled();
    });
  });
});
