import { window, Range, TextEditor, TextDocument, TextEditorEdit } from 'vscode';
import { BaseCommandHandler } from '../../../../../src/commands/handlers/base/baseCommandHandler';
import { logger } from '../../../../../src/utils/logger';
import { BASE_HANDLER_MESSAGES } from '../../../../../src/utils/constants';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    activeTextEditor: null,
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), append: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), clear: jest.fn() })),
  },
  Range: jest.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  })),
  Position: jest.fn().mockImplementation((line, char) => ({
    line,
    character: char,
  })),
}));

describe('BaseCommandHandler', () => {
  // Create a concrete implementation for testing
  class TestCommandHandler extends BaseCommandHandler {
    async execute(): Promise<void> {
      // Test implementation
    }
  }

  let mockEditor: jest.Mocked<TextEditor>;
  let mockDocument: jest.Mocked<TextDocument>;
  let mockEditBuilder: jest.Mocked<TextEditorEdit>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDocument = {
      fileName: '/test/file.txt',
      uri: { fsPath: '/test/file.txt' } as any,
    } as any;

    mockEditBuilder = {
      replace: jest.fn(),
    } as any;

    mockEditor = {
      document: mockDocument,
      selection: {
        active: { line: 0, character: 0 },
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      } as any,
      edit: jest.fn((callback) => callback(mockEditBuilder)),
    } as any;

    (window.activeTextEditor as any) = null;
  });

  describe('constructor', () => {
    it('should log initialization message', () => {
      new TestCommandHandler();

      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INITIALIZING
      );
    });
  });

  describe('insertKeeperRefInActiveTextEditor', () => {
    let handler: TestCommandHandler;

    beforeEach(() => {
      handler = new TestCommandHandler();
    });

    it('should return false when no active text editor', async () => {
      (window.activeTextEditor as any) = null;

      const result = await handler.insertKeeperRefInActiveTextEditor('keeper://test');

      expect(result).toBe(false);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INSERTING_KEEPER_REFERENCE_IN_ACTIVE_TEXT_EDITOR +
          ' with reference: keeper://test'
      );
      expect(logger.logError).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_ERROR.NO_ACTIVE_TEXT_EDITOR_FOUND
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.ERROR.NO_FILE_OPEN
      );
    });

    it('should replace reference in range when range is provided', async () => {
      (window.activeTextEditor as any) = mockEditor;
      const range = new Range(1, 2, 3, 4);
      const reference = 'keeper://uid123/field/password';

      const result = await handler.insertKeeperRefInActiveTextEditor(reference, range);

      expect(result).toBe(true);
      expect(mockEditor.edit).toHaveBeenCalled();
      expect(mockEditBuilder.replace).toHaveBeenCalledWith(range, reference);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INSERTING_KEEPER_REFERENCE_IN_ACTIVE_TEXT_EDITOR +
          ' with reference: ' + reference
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.REPLACED_REFERENCE_IN_RANGE +
          ' with file: /test/file.txt' +
          ' and range: 1:2-3:4'
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.KEEPER_REFERENCE_INSERTED_SUCCESSFULLY
      );
    });

    it('should replace reference in selection when no range is provided', async () => {
      (window.activeTextEditor as any) = mockEditor;
      const reference = 'keeper://uid123/field/password';

      const result = await handler.insertKeeperRefInActiveTextEditor(reference);

      expect(result).toBe(true);
      expect(mockEditor.edit).toHaveBeenCalled();
      expect(mockEditBuilder.replace).toHaveBeenCalledWith(mockEditor.selection, reference);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INSERTING_KEEPER_REFERENCE_IN_ACTIVE_TEXT_EDITOR +
          ' with reference: ' + reference
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.REPLACED_REFERENCE_IN_SELECTION +
          ' with file: /test/file.txt' +
          ' and selection: 0:0'
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.KEEPER_REFERENCE_INSERTED_SUCCESSFULLY
      );
    });

    it('should handle edit errors and return false', async () => {
      (window.activeTextEditor as any) = mockEditor;
      const error = new Error('Edit failed');
      mockEditor.edit = jest.fn().mockRejectedValue(error);
      const reference = 'keeper://uid123/field/password';

      const result = await handler.insertKeeperRefInActiveTextEditor(reference);

      expect(result).toBe(false);
      expect(mockEditor.edit).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_ERROR.FAILED_TO_INSERT_KEEPER_REFERENCE +
          ' with error: ' + error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.ERROR.FAILED_TO_INSERT_REFERENCE
      );
    });

    it('should handle edit callback throwing an error', async () => {
      (window.activeTextEditor as any) = mockEditor;
      const error = new Error('Edit builder error');
      mockEditor.edit = jest.fn((callback) => {
        try {
          callback(mockEditBuilder);
        } catch (e) {
          return Promise.reject(e);
        }
        return Promise.resolve(true);
      });
      mockEditBuilder.replace = jest.fn().mockImplementation(() => {
        throw error;
      });
      const reference = 'keeper://uid123/field/password';

      const result = await handler.insertKeeperRefInActiveTextEditor(reference);

      expect(result).toBe(false);
      expect(logger.logError).toHaveBeenCalledWith(
        'TestCommandHandler: ' + BASE_HANDLER_MESSAGES.LOGGER_ERROR.FAILED_TO_INSERT_KEEPER_REFERENCE +
          ' with error: ' + error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.ERROR.FAILED_TO_INSERT_REFERENCE
      );
    });

    it('should handle edit returning false', async () => {
      (window.activeTextEditor as any) = mockEditor;
      mockEditor.edit = jest.fn().mockResolvedValue(false);
      const reference = 'keeper://uid123/field/password';

      const result = await handler.insertKeeperRefInActiveTextEditor(reference);

      expect(result).toBe(true); // The method still returns true even if edit returns false
      expect(mockEditor.edit).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('should be abstract and require implementation', () => {
      const handler = new TestCommandHandler();

      expect(handler.execute).toBeDefined();
      expect(typeof handler.execute).toBe('function');
    });

    it('should allow subclasses to implement execute', async () => {
      class CustomHandler extends BaseCommandHandler {
        async execute(): Promise<void> {
          // Custom implementation
        }
      }

      const handler = new CustomHandler();
      await expect(handler.execute()).resolves.toBeUndefined();
    });
  });
});
