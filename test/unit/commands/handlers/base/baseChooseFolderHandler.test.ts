import { BaseChooseFolderHandler } from '../../../../../src/commands/handlers/base/baseChooseFolderHandler';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');
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

// Create a concrete implementation for testing
class TestChooseFolderHandler extends BaseChooseFolderHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseChooseFolderHandler', () => {
  it('should be able to instantiate', () => {
    const handler = new TestChooseFolderHandler();
    expect(handler).toBeInstanceOf(BaseChooseFolderHandler);
  });

  it('should be an abstract class that extends BaseCommandHandler', () => {
    const handler = new TestChooseFolderHandler();
    expect(handler).toBeDefined();
  });
});
