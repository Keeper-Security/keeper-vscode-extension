/* eslint-disable @typescript-eslint/no-explicit-any */
import { CliService } from '../../../../src/services/cli';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { GetValueHandler } from '../../../../src/commands/handlers/getValueHandler';
import { ExtensionContext, window } from 'vscode';
import { logger } from '../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../src/services/cli');
jest.mock('../../../../src/utils/helper', () => ({
  StatusBarSpinner: jest.fn(),
  createKeeperReference: jest.fn(),
  resolveFolderPaths: jest.fn()
}));
jest.mock('../../../../src/utils/logger');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    activeTextEditor: null, // Will be set in individual tests
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn()
    }))
  }
}));

describe('GetValueHandler', () => {
  let mockCliService: jest.Mocked<CliService>;
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let getValueHandler: GetValueHandler;
  let mockCreateKeeperReference: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCliService = {
      isCLIReady: jest.fn(),
      executeCommanderCommand: jest.fn()
    } as unknown as jest.Mocked<CliService>;

    mockContext = {} as ExtensionContext;
    
    // Properly mock the StatusBarSpinner with required methods
    mockSpinner = {
      show: jest.fn(),
      updateMessage: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<StatusBarSpinner>;

    // Get the mocked createKeeperReference function
    mockCreateKeeperReference = require('../../../../src/utils/helper').createKeeperReference;

    getValueHandler = new GetValueHandler(mockCliService, mockContext, mockSpinner);
  });

  describe('constructor', () => {
    it('should properly initialize with dependencies', () => {
      expect(getValueHandler).toBeInstanceOf(GetValueHandler);
    });
  });

  describe('execute', () => {
    it('should execute successfully when CLI is ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses - note the order: sync-down, list, get
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock the createKeeperReference function
      mockCreateKeeperReference.mockReturnValue('keeper://123/field/username');

      await getValueHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('list', ['--format=json']);
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('get', ['123', '--format=json']);
      expect(window.showQuickPick).toHaveBeenCalledTimes(2); // Called twice for record and field selection
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should not execute when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await getValueHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockCliService.executeCommanderCommand).not.toHaveBeenCalled();
      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle user cancellation of record selection', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]'); // list command
      
      // Mock the QuickPick to return undefined (user cancellation)
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

      await getValueHandler.execute();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('list', ['--format=json']);
      expect(window.showQuickPick).toHaveBeenCalledTimes(1); // Only called once for record selection
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle user cancellation of field selection', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce(undefined); // field selection cancelled

      await getValueHandler.execute();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledTimes(3); // sync-down, list, and get commands
      expect(window.showQuickPick).toHaveBeenCalledTimes(2); // Called twice for record and field selection
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });

  describe('complete execution flow', () => {
    it('should complete the full value retrieval workflow', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock the createKeeperReference function
      mockCreateKeeperReference.mockReturnValue('keeper://123/field/username');
      
      // Mock the active text editor
      const mockEditor = {
        selection: { active: { line: 0, character: 0 } },
        edit: jest.fn().mockResolvedValue(true)
      };
      (window as any).activeTextEditor = mockEditor;

      await getValueHandler.execute();

      // Verify the complete workflow
      expect(mockCreateKeeperReference).toHaveBeenCalledWith('123', 'field', 'username');
      expect(mockEditor.edit).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalledWith('Reference of "username" field of secret "Test Record" retrieved successfully!');
    });

    it('should handle empty records list', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[]'); // empty records list
      
      // Mock the QuickPick to return undefined (no records to select from)
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

      await getValueHandler.execute();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('list', ['--format=json']);
      expect(window.showQuickPick).toHaveBeenCalledWith([], expect.any(Object));
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle records with no fields', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [], "custom": []}'); // No fields
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce(undefined); // field selection (no fields to select from)

      await getValueHandler.execute();

      expect(window.showQuickPick).toHaveBeenCalledWith([], expect.any(Object)); // Empty fields list
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });

  describe('error scenarios', () => {
    it('should handle createKeeperReference returning null', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock createKeeperReference to return null
      mockCreateKeeperReference.mockReturnValue(null);

      await getValueHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GetValueHandler.execute failed: Something went wrong while generating a password! Please try again.', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to get value: Something went wrong while generating a password! Please try again.');
    });

    it('should handle no active text editor', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock the createKeeperReference function
      mockCreateKeeperReference.mockReturnValue('keeper://123/field/username');
      
      // No active text editor
      (window as any).activeTextEditor = null;

      await getValueHandler.execute();

      // Should still show success message even without editor
      expect(window.showInformationMessage).toHaveBeenCalledWith('Reference of "username" field of secret "Test Record" retrieved successfully!');
    });

    it('should handle CLI command errors', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock CLI command to throw error
      mockCliService.executeCommanderCommand.mockRejectedValue(new Error('CLI command failed'));

      await getValueHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GetValueHandler.execute failed: CLI command failed', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to get value: CLI command failed');
    });

    it('should handle malformed JSON responses', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock malformed JSON response for list command
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('invalid json'); // malformed JSON for list command

      await getValueHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GetValueHandler.execute failed: Unexpected token \'i\', "invalid json" is not valid JSON', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to get value: Unexpected token \'i\', "invalid json" is not valid JSON');
    });
  });

  describe('spinner management', () => {
    it('should show and hide spinner correctly', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}], "custom": []}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock the createKeeperReference function
      mockCreateKeeperReference.mockReturnValue('keeper://123/field/username');

      await getValueHandler.execute();

      expect(mockSpinner.show).toHaveBeenCalledWith('Retrieving secrets...');
      expect(mockSpinner.show).toHaveBeenCalledWith('Retrieving secrets details...');
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });

  describe('field processing', () => {
    it('should correctly process and filter fields', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      
      // Mock the CLI responses with various field types
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down command
        .mockResolvedValueOnce('[{"record_uid": "123", "title": "Test Record"}]') // list command
        .mockResolvedValueOnce('{"fields": [{"label": "username", "value": "testuser", "type": "text"}, {"label": "", "value": "", "type": "password"}], "custom": [{"label": "api_key", "value": "key123", "type": "text"}]}'); // get command
      
      // Mock the QuickPick responses
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({ label: 'Test Record', value: '123' }) // record selection
        .mockResolvedValueOnce({ label: 'username', value: 'username', fieldType: 'field' }); // field selection
      
      // Mock the createKeeperReference function
      mockCreateKeeperReference.mockReturnValue('keeper://123/field/username');

      await getValueHandler.execute();

      // Should only show fields with values (filtered out empty fields)
      expect(window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'username', fieldType: 'field' }),
          expect.objectContaining({ label: 'api_key', fieldType: 'custom_field' })
        ]),
        expect.any(Object)
      );
    });
  });
});
