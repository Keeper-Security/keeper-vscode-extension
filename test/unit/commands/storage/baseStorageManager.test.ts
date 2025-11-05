import { ExtensionContext, window } from 'vscode';
import { BaseStorageManager } from '../../../../src/commands/storage/baseStorageManager';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { logger } from '../../../../src/utils/logger';
import { IFolder } from '../../../../src/types';

// Mock dependencies
jest.mock('../../../../src/utils/logger');
jest.mock('../../../../src/utils/helper', () => ({
  StatusBarSpinner: jest.fn(),
  commonQuickPickOptions: {},
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showWarningMessage: jest.fn(),
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
class TestStorageManager extends BaseStorageManager {
  async fetchAvailableFolders(): Promise<{
    availableFolders: IFolder[];
    rootFolder: IFolder;
  }> {
    return {
      availableFolders: [],
      rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
    };
  }
}

describe('BaseStorageManager', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let storageManager: TestStorageManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      subscriptions: [],
    } as unknown as ExtensionContext;

    mockSpinner = {
      show: jest.fn(),
      updateMessage: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    storageManager = new TestStorageManager(mockContext, mockSpinner);
  });

  describe('constructor', () => {
    it('should initialize storage manager and log debug message', () => {
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Initializing'
      );
    });
  });

  describe('getCurrentStorage', () => {
    it('should retrieve current storage from workspace state', () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: '/',
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      const result = storageManager.getCurrentStorage();

      expect(mockContext.workspaceState.get).toHaveBeenCalledWith('currentStorage', null);
      expect(result).toEqual(mockStorage);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Retrieved current storage with value: Test Folder'
      );
    });

    it('should return null when no storage is set', () => {
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(null);

      const result = storageManager.getCurrentStorage();

      expect(result).toBeNull();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Retrieved current storage with value: null'
      );
    });
  });

  describe('setCurrentStorage', () => {
    it('should set current storage in workspace state', () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: '/',
        folderPath: '/Test Folder',
      };

      storageManager.setCurrentStorage(mockStorage);

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', mockStorage);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Setting current storage with value: Test Folder'
      );
    });

    it('should set storage to null', () => {
      storageManager.setCurrentStorage(null);

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', null);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Setting current storage with value: null'
      );
    });
  });

  describe('validateCurrentStorage', () => {
    it('should return true when current storage is My Vault', async () => {
      const mockStorage: IFolder = {
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      const result = await (storageManager as any).validateCurrentStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(result).toBe(true);
      expect(mockSpinner.show).toHaveBeenCalledWith('Validating storage...');
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Current storage is My Vault'
      );
    });

    it('should return false when no current storage exists', async () => {
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(null);

      const result = await (storageManager as any).validateCurrentStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(result).toBe(false);
      expect(mockSpinner.show).toHaveBeenCalledWith('Validating storage...');
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: No current storage found'
      );
    });

    it('should return true when folder exists in available folders', async () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: 'root-folder', // Must NOT be '/' to bypass My Vault check
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      // Create a mock function instead of spying on the method
      const mockFetchAvailableFolders = jest.fn().mockResolvedValue({
        availableFolders: [mockStorage],
        rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
      });

      const result = await (storageManager as any).validateCurrentStorage(
        mockFetchAvailableFolders
      );

      expect(result).toBe(true);
      expect(mockSpinner.hide).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Folder exists on Keeper vault with value: Test Folder'
      );
    });

    it('should return false and clear storage when folder no longer exists', async () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: 'root-folder', // Must NOT be '/' to bypass My Vault check
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      // Create a mock function instead of spying on the method
      const mockFetchAvailableFolders = jest.fn().mockResolvedValue({
        availableFolders: [
          { folderUid: '456', name: 'Other Folder', parentUid: '/', folderPath: '/Other Folder' },
        ],
        rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
      });

      const result = await (storageManager as any).validateCurrentStorage(
        mockFetchAvailableFolders
      );

      expect(result).toBe(false);
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', null);
      expect(mockSpinner.hide).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'TestStorageManager: Folder no longer exists on Keeper vault with value: Test Folder'
      );
    });
  });

  describe('ensureValidStorage', () => {
    it('should choose folder when no current storage exists', async () => {
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(null);
      const chooseFolderSpy = jest.spyOn(storageManager, 'chooseFolder').mockResolvedValue();

      await storageManager.ensureValidStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(chooseFolderSpy).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: No current storage found, prompting for folder selection'
      );
    });

    it('should return false when user cancels folder selection', async () => {
      (mockContext.workspaceState.get as jest.Mock)
        .mockReturnValueOnce(null) // Initial check
        .mockReturnValueOnce(null); // After chooseFolder
      jest.spyOn(storageManager, 'chooseFolder').mockResolvedValue();

      const result = await storageManager.ensureValidStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(result).toBe(false);
    });

    it('should validate existing storage successfully', async () => {
      const mockStorage: IFolder = {
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      const result = await storageManager.ensureValidStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(result).toBe(true);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Current storage exists, validating...'
      );
    });

    it('should prompt for new folder when validation fails', async () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: 'root-folder', // Must NOT be '/' to bypass My Vault check
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock)
        .mockReturnValueOnce(mockStorage) // Initial check
        .mockReturnValueOnce(mockStorage); // During validation
      
      // Create a mock function instead of spying on the method
      const mockFetchAvailableFolders = jest.fn().mockResolvedValue({
        availableFolders: [],
        rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
      });
      
      const chooseFolderSpy = jest.spyOn(storageManager, 'chooseFolder').mockResolvedValue();
      (window.showWarningMessage as jest.Mock).mockResolvedValue('Yes');
      (mockContext.workspaceState.get as jest.Mock).mockReturnValueOnce(null); // After chooseFolder

      const result = await storageManager.ensureValidStorage(
        mockFetchAvailableFolders
      );

      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'Previously selected folder is no longer available. Would you like to choose a new folder?',
        'Yes',
        'No'
      );
      expect(chooseFolderSpy).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Current storage validation failed, prompting for new selection'
      );
      expect(result).toBe(false); // User selected folder but it was null
    });

    it('should return false when user declines to choose new folder', async () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: 'root-folder', // Must NOT be '/' to bypass My Vault check
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);
      
      // Create a mock function instead of spying on the method
      const mockFetchAvailableFolders = jest.fn().mockResolvedValue({
        availableFolders: [],
        rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
      });
      
      const chooseFolderSpy = jest.spyOn(storageManager, 'chooseFolder').mockResolvedValue();
      (window.showWarningMessage as jest.Mock).mockResolvedValue('No');

      const result = await storageManager.ensureValidStorage(
        mockFetchAvailableFolders
      );

      expect(chooseFolderSpy).not.toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: User chose not to select new folder'
      );
      expect(result).toBe(false);
    });

    it('should return true when validation succeeds and user selects new folder', async () => {
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: '/',
        folderPath: '/Test Folder',
      };
      const newStorage: IFolder = {
        folderUid: '456',
        name: 'New Folder',
        parentUid: '/',
        folderPath: '/New Folder',
      };
      
      (mockContext.workspaceState.get as jest.Mock)
        .mockReturnValueOnce(mockStorage) // Initial check
        .mockReturnValueOnce(mockStorage) // During validation
        .mockReturnValueOnce(newStorage); // After chooseFolder
      
      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: [],
        rootFolder: { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
      });
      
      jest.spyOn(storageManager, 'chooseFolder').mockResolvedValue();
      (window.showWarningMessage as jest.Mock).mockResolvedValue('Yes');

      const result = await storageManager.ensureValidStorage(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(result).toBe(true);
    });
  });

  describe('chooseFolder', () => {
    it('should automatically set root folder when only one folder available', async () => {
      const rootFolder: IFolder = {
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
      };

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: [rootFolder],
        rootFolder,
      });

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', rootFolder);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Storage location automatically set to My Vault folder (no other folders available)'
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: No folders availableautomatically setting My Vault as storage'
      );
    });

    it('should show quick pick when multiple folders available', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        { folderUid: '123', name: 'Folder 1', parentUid: '/', folderPath: '/Folder 1' },
        { folderUid: '456', name: 'Folder 2', parentUid: '/', folderPath: '/Folder 2' },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      const selectedFolder = { label: 'Folder 1', value: '123' };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedFolder);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'My Vault', value: '/' }),
          expect.objectContaining({ label: 'Folder 1', value: '123' }),
          expect.objectContaining({ label: 'Folder 2', value: '456' }),
        ]),
        expect.objectContaining({
          title: 'Available folders',
          placeHolder: 'Select a folder to use as storage location while saving secrets',
        })
      );
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', folders[1]);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Storage location set to Folder 1 folder'
      );
    });

    it('should mark current storage with checkmark in quick pick', async () => {
      const currentStorage: IFolder = {
        folderUid: '123',
        name: 'Folder 1',
        parentUid: '/',
        folderPath: '/Folder 1',
      };
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        currentStorage,
        { folderUid: '456', name: 'Folder 2', parentUid: '/', folderPath: '/Folder 2' },
      ];

      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(currentStorage);
      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'My Vault', value: '/' }),
          expect.objectContaining({ label: 'Folder 1 ✓', value: '123' }),
          expect.objectContaining({ label: 'Folder 2', value: '456' }),
        ]),
        expect.any(Object)
      );
    });

    it('should include folder path in detail when available', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        {
          folderUid: '123',
          name: 'Folder 1',
          parentUid: '/',
          folderPath: '/My Vault / Folder 1',
        },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'My Vault', value: '/' }),
          expect.objectContaining({
            label: 'Folder 1',
            value: '123',
            detail: 'Path: /My Vault / Folder 1',
          }),
        ]),
        expect.any(Object)
      );
    });

    it('should not include detail when folder path is root', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        { folderUid: '123', name: 'Folder 1', parentUid: '/', folderPath: '/' },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      const quickPickCall = (window.showQuickPick as jest.Mock).mock.calls[0][0];
      const folder1Item = quickPickCall.find((item: any) => item.value === '123');
      expect(folder1Item.detail).toBeUndefined();
    });

    it('should handle user cancellation', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        { folderUid: '123', name: 'Folder 1', parentUid: '/', folderPath: '/Folder 1' },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(window.showInformationMessage).not.toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: No folder selected by user'
      );
    });

    it('should handle folder selection with path in label', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        { folderUid: '123', name: 'Folder 1', parentUid: '/', folderPath: '/Folder 1' },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      const selectedFolder = { label: 'Folder 1 ✓', value: '123' };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedFolder);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', folders[1]);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Storage location set to Folder 1 ✓ folder'
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: User selected folder with value: Folder 1 ✓ and 123'
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        'TestStorageManager: Storage location updated to with value: Folder 1 ✓'
      );
    });

    it('should handle folder not found in available folders', async () => {
      const folders: IFolder[] = [
        { folderUid: '/', name: 'My Vault', parentUid: '/', folderPath: '/' },
        { folderUid: '123', name: 'Folder 1', parentUid: '/', folderPath: '/Folder 1' },
      ];

      jest.spyOn(storageManager, 'fetchAvailableFolders').mockResolvedValue({
        availableFolders: folders,
        rootFolder: folders[0],
      });

      const selectedFolder = { label: 'Non-existent', value: '999' };
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedFolder);

      await storageManager.chooseFolder(
        storageManager.fetchAvailableFolders.bind(storageManager)
      );

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('currentStorage', null);
    });
  });
});
