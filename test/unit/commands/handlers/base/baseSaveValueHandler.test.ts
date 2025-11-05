import { Range, Selection, Uri, window, workspace } from 'vscode';
import { BaseSaveValueHandler } from '../../../../../src/commands/handlers/base/baseSaveValueHandler';
import { commonInputBoxOptions } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { BASE_HANDLER_MESSAGES, KEEPER_FIELD_TYPES } from '../../../../../src/utils/constants';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  commonInputBoxOptions: {
    ignoreFocusOut: true,
    validateInput: undefined,
  },
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
    activeTextEditor: undefined,
    showTextDocument: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
    })),
  },
  workspace: {
    openTextDocument: jest.fn(),
  },
  Range: jest.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  })),
  Selection: jest.fn().mockImplementation((startOrLine, startCharOrEnd, endLine, endChar) => {
    // Handle both constructor signatures:
    // new Selection(start: Position, end: Position)
    // new Selection(startLine: number, startCharacter: number, endLine: number, endCharacter: number)
    if (typeof startOrLine === 'number' && typeof startCharOrEnd === 'number') {
      return {
        start: { line: startOrLine, character: startCharOrEnd },
        end: { line: endLine, character: endChar },
      };
    }
    return {
      start: startOrLine,
      end: startCharOrEnd,
    };
  }),
  Uri: {
    file: jest.fn().mockImplementation((path) => ({
      fsPath: path,
      toString: () => `file://${path}`,
    })),
  },
}));

// Create a concrete implementation for testing
class TestSaveValueHandler extends BaseSaveValueHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseSaveValueHandler', () => {
  let handler: TestSaveValueHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestSaveValueHandler();
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

  describe('getSecretFieldNameFromUser', () => {
    it('should prompt user for field name', async () => {
      const fieldName = 'password';
      (window.showInputBox as jest.Mock).mockResolvedValue(fieldName);

      const result = await handler.getSecretFieldNameFromUser();

      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: BASE_HANDLER_MESSAGES.INPUT.RECORD_FIELD_NAME_FROM_USER_PROMPT,
        placeHolder: BASE_HANDLER_MESSAGES.INPUT.RECORD_FIELD_NAME_FROM_USER_PLACEHOLDER,
        ...commonInputBoxOptions,
      });
      expect(result).toBe(fieldName);
      expect(logger.logDebug).toHaveBeenCalled();
    });

    it('should return undefined when user cancels', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await handler.getSecretFieldNameFromUser();

      expect(result).toBeUndefined();
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_RECORD_FIELD_NAME_PROVIDED)
      );
    });

    it('should log when user provides field name', async () => {
      const fieldName = 'api_key';
      (window.showInputBox as jest.Mock).mockResolvedValue(fieldName);

      await handler.getSecretFieldNameFromUser();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_PROVIDED_RECORD_FIELD_NAME)
      );
    });
  });

  describe('getFieldType', () => {
    it('should return SECRET type for password fields', () => {
      const result = handler.getFieldType('password');

      expect(result).toBe(KEEPER_FIELD_TYPES.SECRET);
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.FIELD_MATCHED_TYPE)
      );
    });

    it('should return SECRET type for various secret field patterns', () => {
      const secretFields = [
        'api_key',
        'API_KEY',
        'secret_key',
        'token',
        'auth_token',
        'private_key',
        'ssh_key',
      ];

      secretFields.forEach((fieldName) => {
        const result = handler.getFieldType(fieldName);
        expect(result).toBe(KEEPER_FIELD_TYPES.SECRET);
      });
    });

    it('should return TEXT type for non-secret fields', () => {
      const result = handler.getFieldType('username');

      expect(result).toBe(KEEPER_FIELD_TYPES.TEXT);
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.FIELD_DEFAULTED_TO_TYPE)
      );
    });

    it('should match case-insensitive patterns', () => {
      expect(handler.getFieldType('PASSWORD')).toBe(KEEPER_FIELD_TYPES.SECRET);
      expect(handler.getFieldType('Secret')).toBe(KEEPER_FIELD_TYPES.SECRET);
      expect(handler.getFieldType('API-KEY')).toBe(KEEPER_FIELD_TYPES.SECRET);
    });
  });

  describe('getSelectedText', () => {
    it('should use CodeLens values when provided', async () => {
      const secretValue = 'secret123';
      const range = new Range(0, 0, 0, 10);
      const documentUri = Uri.file('/path/to/file.txt');
      const mockEditor = {
        document: {
          uri: Uri.file('/other/file.txt'),
          fileName: 'file.txt',
        },
        selection: new Selection(0, 0, 0, 5),
      };
      const mockDocument = {
        uri: documentUri,
      };

      (window.activeTextEditor as any) = undefined;
      (workspace.openTextDocument as jest.Mock).mockResolvedValue(mockDocument);
      (window.showTextDocument as jest.Mock).mockResolvedValue(mockEditor);

      const result = await handler.getSelectedText(secretValue, range, documentUri);

      expect(workspace.openTextDocument).toHaveBeenCalledWith(documentUri);
      expect(window.showTextDocument).toHaveBeenCalledWith(mockDocument);
      expect(result).toBe('secret123');
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USING_CODELENS_VALUES)
      );
    });

    it('should not open document if already active', async () => {
      const secretValue = 'secret123';
      const range = new Range(0, 0, 0, 10);
      const documentUri = Uri.file('/path/to/file.txt');
      const mockEditor = {
        document: {
          uri: documentUri,
          fileName: 'file.txt',
        },
        selection: new Selection(0, 0, 0, 5),
      };

      (window.activeTextEditor as any) = mockEditor;

      const result = await handler.getSelectedText(secretValue, range, documentUri);

      expect(workspace.openTextDocument).not.toHaveBeenCalled();
      expect(result).toBe('secret123');
    });

    it('should use manual selection when CodeLens values not provided', async () => {
      const mockEditor = {
        document: {
          getText: jest.fn().mockReturnValue('selected text'),
        },
        selection: new Selection(0, 0, 0, 12),
      };

      (window.activeTextEditor as any) = mockEditor;

      const result = await handler.getSelectedText();

      expect(mockEditor.document.getText).toHaveBeenCalledWith(mockEditor.selection);
      expect(result).toBe('selected text');
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USING_MANUAL_SELECTION_MODE)
      );
    });

    it('should return undefined when no text selected manually', async () => {
      const mockEditor = {
        document: {
          getText: jest.fn().mockReturnValue(''),
        },
        selection: new Selection(0, 0, 0, 0),
      };

      (window.activeTextEditor as any) = mockEditor;

      const result = await handler.getSelectedText();

      expect(result).toBeUndefined();
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_TEXT_SELECTED_BY_USER)
      );
    });

    it('should return undefined when no active editor', async () => {
      (window.activeTextEditor as any) = undefined;

      const result = await handler.getSelectedText();

      expect(result).toBeUndefined();
    });

    it('should trim selected text', async () => {
      const mockEditor = {
        document: {
          getText: jest.fn().mockReturnValue('  text with spaces  '),
        },
        selection: new Selection(0, 0, 0, 20),
      };

      (window.activeTextEditor as any) = mockEditor;

      const result = await handler.getSelectedText();

      expect(result).toBe('text with spaces');
    });
  });

  describe('showFunctionalitySuccessMessage', () => {
    it('should show success message without storage name', () => {
      handler.showFunctionalitySuccessMessage();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.SECRET_SAVED_TO_KEEPER_VAULT
      );
    });

    it('should show success message with storage name', () => {
      handler.showFunctionalitySuccessMessage('My Folder');

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.SECRET_SAVED_TO_KEEPER_VAULT + ' at "My Folder" folder successfully!'
      );
    });
  });
});
