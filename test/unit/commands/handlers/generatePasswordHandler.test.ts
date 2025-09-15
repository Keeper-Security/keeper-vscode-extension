/* eslint-disable @typescript-eslint/no-explicit-any */
import { CliService } from '../../../../src/services/cli';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { GeneratePasswordHandler } from '../../../../src/commands/handlers/generatePasswordHandler';
import { StorageManager } from '../../../../src/commands/storage/storageManager';
import { ExtensionContext, window } from 'vscode';
import { logger } from '../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../src/services/cli');
jest.mock('../../../../src/commands/storage/storageManager');
jest.mock('../../../../src/commands/utils/commandUtils');
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

describe('GeneratePasswordHandler', () => {
  let mockCliService: jest.Mocked<CliService>;
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let generatePasswordHandler: GeneratePasswordHandler;
  let mockCreateKeeperReference: jest.Mock;
  let mockCommandUtils: any;

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
    
    mockStorageManager = {
      ensureValidStorage: jest.fn(),
      getCurrentStorage: jest.fn()
    } as unknown as jest.Mocked<StorageManager>;

    // Get the mocked createKeeperReference function
    mockCreateKeeperReference = require('../../../../src/utils/helper').createKeeperReference;

    // Get the mocked CommandUtils
    mockCommandUtils = require('../../../../src/commands/utils/commandUtils').CommandUtils;

    generatePasswordHandler = new GeneratePasswordHandler(mockCliService, mockContext, mockSpinner, mockStorageManager);
  });

  describe('execute', () => {
    it('should execute successfully when CLI is ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');

      await generatePasswordHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockStorageManager.ensureValidStorage).toHaveBeenCalled();
      expect(mockCommandUtils.getSecretNameFromUser).toHaveBeenCalledWith('ks-vscode.generatePassword');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        '--title="Test Record"',
        '--record-type=login',
        '"password"=$GEN',
        '--folder="123"'
      ]);
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should not execute when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await generatePasswordHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockStorageManager.ensureValidStorage).not.toHaveBeenCalled();
      expect(mockCommandUtils.getSecretNameFromUser).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle user cancellation of record name input', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCommandUtils.getSecretNameFromUser.mockRejectedValue(new Error('No record name provided.'));

      await generatePasswordHandler.execute();
      
      expect(mockCommandUtils.getSecretNameFromUser).toHaveBeenCalledWith('ks-vscode.generatePassword');
      expect(logger.logError).toHaveBeenCalledWith('GeneratePasswordHandler.execute failed: No record name provided.', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to generate password: No record name provided.');
      expect(mockSpinner.hide).toHaveBeenCalled();
    });
  });

  describe('constructor', () => {
    it('should properly initialize with dependencies', () => {
      expect(generatePasswordHandler).toBeInstanceOf(GeneratePasswordHandler);
    });
  });

  describe('execute edge cases', () => {
    it('should handle record creation failure', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce(''); // Empty record UID

      await generatePasswordHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GeneratePasswordHandler.execute failed: Something went wrong while generating a password! Please try again.', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to generate password: Something went wrong while generating a password! Please try again.');
    });

    it('should handle storage validation failure', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockStorageManager.ensureValidStorage.mockRejectedValue(new Error('Storage validation failed'));

      await generatePasswordHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GeneratePasswordHandler.execute failed: Storage validation failed', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to generate password: Storage validation failed');
    });

    it('should handle different storage folder configurations', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');

      await generatePasswordHandler.execute();

      // Should not add --folder argument for My Vault
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        '--title="Test Record"',
        '--record-type=login',
        '"password"=$GEN'
      ]);
    });

    it('should show spinner during password generation', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');

      await generatePasswordHandler.execute();

      expect(mockSpinner.show).toHaveBeenCalledWith('Generating password...');
    });

    it('should show success message when password is generated', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // Mock the active text editor
      const mockEditor = {
        selection: { active: { line: 0, character: 0 } },
        edit: jest.fn().mockResolvedValue(true)
      };
      (window as any).activeTextEditor = mockEditor;

      // Set up the createKeeperReference mock for this test
      mockCreateKeeperReference.mockReturnValue('keeper://record123/field/password');

      await generatePasswordHandler.execute();

      expect(window.showInformationMessage).toHaveBeenCalledWith('Password generated and saved to keeper vault at "Test Folder" folder successfully!');
    });
  });

  describe('complete execution flow', () => {
    it('should complete the full password generation workflow', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // Mock the active text editor
      const mockEditor = {
        selection: { active: { line: 0, character: 0 } },
        edit: jest.fn().mockResolvedValue(true)
      };
      (window as any).activeTextEditor = mockEditor;

      // Set up the createKeeperReference mock
      mockCreateKeeperReference.mockReturnValue('keeper://record123/field/password');

      await generatePasswordHandler.execute();

      // Verify the complete workflow
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        '--title="Test Record"',
        '--record-type=login',
        '"password"=$GEN',
        '--folder="123"'
      ]);
      expect(mockCreateKeeperReference).toHaveBeenCalledWith('record123', 'field', 'password');
      expect(mockEditor.edit).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalledWith('Password generated and saved to keeper vault at "Test Folder" folder successfully!');
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle createKeeperReference returning null', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // Mock createKeeperReference to return null
      mockCreateKeeperReference.mockReturnValue(null);

      await generatePasswordHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GeneratePasswordHandler.execute failed: Something went wrong while generating a password! Please try again.', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to generate password: Something went wrong while generating a password! Please try again.');
    });

    it('should handle no active text editor', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // No active text editor
      (window as any).activeTextEditor = null;

      // Set up the createKeeperReference mock
      mockCreateKeeperReference.mockReturnValue('keeper://record123/field/password');

      await generatePasswordHandler.execute();

      // Should still show success message even without editor
      expect(window.showInformationMessage).toHaveBeenCalledWith('Password generated and saved to keeper vault at "Test Folder" folder successfully!');
    });

    it('should handle editor edit operation failure', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // Mock the active text editor with failing edit operation
      const mockEditor = {
        selection: { active: { line: 0, character: 0 } },
        edit: jest.fn().mockRejectedValue(new Error('Edit operation failed'))
      };
      (window as any).activeTextEditor = mockEditor;

      // Set up the createKeeperReference mock
      mockCreateKeeperReference.mockReturnValue('keeper://record123/field/password');

      await generatePasswordHandler.execute();
      
      expect(logger.logError).toHaveBeenCalledWith('GeneratePasswordHandler.execute failed: Edit operation failed', expect.any(Error));
      expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to generate password: Edit operation failed');
    });
  });

  describe('CLI command validation', () => {
    it('should use correct CLI command arguments', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockStorageManager.ensureValidStorage.mockResolvedValue();
      mockStorageManager.getCurrentStorage.mockReturnValue({ folderUid: '123', name: 'Test Folder', parentUid: '/', folderPath: '/Test Folder' });
      mockCommandUtils.getSecretNameFromUser.mockResolvedValue('Test Record');
      mockCliService.executeCommanderCommand.mockResolvedValueOnce('record123');
      
      // Mock the active text editor
      const mockEditor = {
        selection: { active: { line: 0, character: 0 } },
        edit: jest.fn().mockResolvedValue(true)
      };
      (window as any).activeTextEditor = mockEditor;

      // Set up the createKeeperReference mock
      mockCreateKeeperReference.mockReturnValue('keeper://record123/field/password');

      await generatePasswordHandler.execute();

      // Verify CLI commands are called with correct arguments
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('record-add', [
        '--title="Test Record"',
        '--record-type=login',
        '"password"=$GEN',
        '--folder="123"'
      ]);
    });
  });
});
