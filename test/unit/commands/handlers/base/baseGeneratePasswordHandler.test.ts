import { window } from 'vscode';
import { BaseGeneratePasswordHandler } from '../../../../../src/commands/handlers/base/baseGeneratePasswordHandler';
import { commonInputBoxOptions } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { BASE_HANDLER_MESSAGES } from '../../../../../src/utils/constants';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  RouterInputBoxOptions: {
    ignoreFocusOut: true,
    validateInput: undefined,
  },
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
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
class TestGeneratePasswordHandler extends BaseGeneratePasswordHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseGeneratePasswordHandler', () => {
  let handler: TestGeneratePasswordHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestGeneratePasswordHandler();
  });

  describe('getRecordNameFromUser', () => {
    it('should prompt user for record name', async () => {
      const recordName = 'My Record';
      (window.showInputBox as jest.Mock).mockResolvedValue(recordName);

      const result = await handler.getRecordNameFromUser();

      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PROMPT,
        placeHolder: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PLACEHOLDER,
        ...commonInputBoxOptions,
      });
      expect(result).toBe(recordName);
      expect(logger.logDebug).toHaveBeenCalled();
    });

    it('should return undefined when user cancels', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await handler.getRecordNameFromUser();

      expect(result).toBeUndefined();
    });
  });

  describe('showFunctionalitySuccessMessage', () => {
    it('should show success message without storage name', () => {
      handler.showFunctionalitySuccessMessage();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.PASSWORD_GENERATED_AND_SAVED_TO_KEEPER_VAULT
      );
    });

    it('should show success message with storage name', () => {
      handler.showFunctionalitySuccessMessage('My Folder');

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.PASSWORD_GENERATED_AND_SAVED_TO_KEEPER_VAULT +
          ' at "My Folder" folder successfully!'
      );
    });
  });
});
