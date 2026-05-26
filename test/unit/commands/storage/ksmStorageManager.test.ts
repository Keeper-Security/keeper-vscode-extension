import { ExtensionContext } from 'vscode';
import { KsmStorageManager } from '../../../../src/commands/storage/ksmStorageManager';
import { KsmService } from '../../../../src/services/ksm';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { logger } from '../../../../src/utils/logger';
import { IKsmGetFoldersResponse, IFolder } from '../../../../src/types';

// Mock dependencies
jest.mock('../../../../src/services/ksm');
jest.mock('../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../src/utils/helper'),
  StatusBarSpinner: jest.fn(),
  commonQuickPickOptions: {},
}));
jest.mock('../../../../src/utils/logger');
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

describe('KsmStorageManager', () => {
  let mockContext: ExtensionContext;
  let mockKsmService: jest.Mocked<KsmService>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let ksmStorageManager: KsmStorageManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      subscriptions: [],
    } as unknown as ExtensionContext;

    mockKsmService = {
      executeKsmCommand: jest.fn(),
      getFolders: jest.fn(),
    } as unknown as jest.Mocked<KsmService>;

    mockSpinner = {
      show: jest.fn(),
      updateMessage: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    ksmStorageManager = new KsmStorageManager(mockContext, mockSpinner, mockKsmService);
  });

  describe('constructor', () => {
    it('should initialize with context, spinner, and ksmService', () => {
      expect(ksmStorageManager).toBeInstanceOf(KsmStorageManager);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'KsmStorageManager: Initializing'
      );
    });
  });

  describe('ensureValidStorage', () => {
    it('should call parent ensureValidStorage with fetchAvailableFolders', async () => {
      // Use a folder that's NOT My Vault so validation actually calls fetchAvailableFolders
      const mockStorage: IFolder = {
        folderUid: '123',
        name: 'Test Folder',
        parentUid: 'root-folder', // Must NOT be '/' to trigger validation
        folderPath: '/Test Folder',
      };
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(mockStorage);

      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '/',
          name: 'My Vault',
        },
        {
          folderUid: '123',
          name: 'Test Folder',
          parentUid: 'root-folder',
        },
      ];

      // Mock getFolders to return the folders
      mockKsmService.getFolders.mockResolvedValue(mockFolders);
      
      // Mock executeKsmCommand to call the callback and return its result
      mockKsmService.executeKsmCommand.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await ksmStorageManager.ensureValidStorage();

      expect(mockKsmService.executeKsmCommand).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('fetchAvailableFolders', () => {
    it('should fetch folders from KSM and return with root folder', async () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '/',
          name: 'My Vault',
        },
        {
          folderUid: '123',
          name: 'Folder 1',
          parentUid: '/',
        },
      ];

      // Mock getFolders to return the folders
      mockKsmService.getFolders.mockResolvedValue(mockFolders);
      
      // Mock executeKsmCommand to call the callback and return its result
      mockKsmService.executeKsmCommand.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await ksmStorageManager.fetchAvailableFolders();

      expect(mockKsmService.executeKsmCommand).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith('Fetching folders from Keeper vault');
      expect(logger.logDebug).toHaveBeenCalledWith('Retrieved 2 folders from vault');

      expect(result.availableFolders.length).toBe(2);
      // The root folder will have "My Vault / My Vault" because the code always prepends "My Vault"
      expect(result.rootFolder).toEqual({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: 'My Vault / My Vault', // This is what the code actually produces
        source: '',
      });
    });

    it('should handle empty folder list', async () => {
      // Mock getFolders to return empty array
      mockKsmService.getFolders.mockResolvedValue([]);
      
      // Mock executeKsmCommand to call the callback and return its result
      mockKsmService.executeKsmCommand.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await ksmStorageManager.fetchAvailableFolders();

      expect(result.availableFolders.length).toBe(0);
      expect(result.rootFolder).toBeUndefined();
    });

    it('should handle executeKsmCommand errors', async () => {
      mockKsmService.executeKsmCommand.mockRejectedValue(new Error('KSM failed'));

      await expect(ksmStorageManager.fetchAvailableFolders()).rejects.toThrow('KSM failed');
    });

    it('should use first folder as root folder', async () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'First Folder',
          parentUid: '/',
        },
        {
          folderUid: '456',
          name: 'Second Folder',
          parentUid: '/',
        },
      ];

      // Mock getFolders to return the folders
      mockKsmService.getFolders.mockResolvedValue(mockFolders);
      
      // Mock executeKsmCommand to call the callback and return its result
      mockKsmService.executeKsmCommand.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await ksmStorageManager.fetchAvailableFolders();

      expect(result.rootFolder).toEqual(result.availableFolders[0]);
      expect(result.rootFolder.folderUid).toBe('123');
    });

    it('should call resolveFolderPaths with fetched folders', async () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '/',
          name: 'My Vault',
        },
      ];

      // Mock getFolders to return the folders
      mockKsmService.getFolders.mockResolvedValue(mockFolders);
      
      // Mock executeKsmCommand to call the callback and return its result
      mockKsmService.executeKsmCommand.mockImplementation(async (callback) => {
        return await callback();
      });

      const resolveFolderPathsSpy = jest.spyOn(ksmStorageManager, 'resolveFolderPaths');

      await ksmStorageManager.fetchAvailableFolders();

      expect(resolveFolderPathsSpy).toHaveBeenCalledWith(mockFolders);
    });
  });

  describe('resolveFolderPaths', () => {
    it('should resolve simple folder paths', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Folder 1',
          parentUid: '/',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        folderUid: '123',
        name: 'Folder 1',
        parentUid: '/',
        folderPath: 'My Vault / Folder 1',
        source: '',
      });
      expect(logger.logDebug).toHaveBeenCalledWith('Resolving paths for 1 folders');
      expect(logger.logDebug).toHaveBeenCalledWith('Resolved paths for 1 folders');
    });

    it('should resolve nested folder paths', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Parent Folder',
          parentUid: '/',
        },
        {
          folderUid: '456',
          name: 'Child Folder',
          parentUid: '123',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        folderUid: '123',
        name: 'Parent Folder',
        parentUid: '/',
        folderPath: 'My Vault / Parent Folder',
        source: '',
      });
      expect(result[1]).toEqual({
        folderUid: '456',
        name: 'Child Folder',
        parentUid: '123',
        folderPath: 'My Vault / Parent Folder / Child Folder',
        source: '',
      });
    });

    it('should handle missing parentUid (defaults to /)', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Folder 1',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result[0].parentUid).toBe('/');
      expect(result[0].folderPath).toBe('My Vault / Folder 1');
    });

    it('should handle missing parent in folder map', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '456',
          name: 'Child Folder',
          parentUid: '999', // Non-existent parent
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        folderUid: '456',
        name: 'Child Folder',
        parentUid: '999',
        folderPath: 'My Vault / Child Folder',
        source: '',
      });
    });

    it('should handle deeply nested folder structures', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '1',
          name: 'Level 1',
          parentUid: '/',
        },
        {
          folderUid: '2',
          name: 'Level 2',
          parentUid: '1',
        },
        {
          folderUid: '3',
          name: 'Level 3',
          parentUid: '2',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result[2]).toEqual({
        folderUid: '3',
        name: 'Level 3',
        parentUid: '2',
        folderPath: 'My Vault / Level 1 / Level 2 / Level 3',
        source: '',
      });
    });

    it('should handle multiple folders with same parent', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Parent Folder',
          parentUid: '/',
        },
        {
          folderUid: '456',
          name: 'Child 1',
          parentUid: '123',
        },
        {
          folderUid: '789',
          name: 'Child 2',
          parentUid: '123',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result).toHaveLength(3);
      expect(result[1].folderPath).toBe('My Vault / Parent Folder / Child 1');
      expect(result[2].folderPath).toBe('My Vault / Parent Folder / Child 2');
    });

    it('should handle empty folder array', () => {
      const result = ksmStorageManager.resolveFolderPaths([]);

      expect(result).toHaveLength(0);
      expect(logger.logDebug).toHaveBeenCalledWith('Resolving paths for 0 folders');
      expect(logger.logDebug).toHaveBeenCalledWith('Resolved paths for 0 folders');
    });

    it('should use folderUid for mapping and in result', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Folder 1',
          parentUid: '/',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      expect(result[0].folderUid).toBe('123');
    });

    it('should handle parentUid that defaults during iteration', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '123',
          name: 'Parent Folder',
          parentUid: '/',
        },
        {
          folderUid: '456',
          name: 'Child Folder',
          parentUid: '123',
        },
        {
          folderUid: '789',
          name: 'Grandchild Folder',
          parentUid: '456',
        },
      ];

      // Simulate missing parentUid in middle folder
      const result = ksmStorageManager.resolveFolderPaths([
        mockFolders[0],
        {
          folderUid: '456',
          name: 'Child Folder',
          // parentUid missing
        },
        mockFolders[2],
      ]);

      // Should handle gracefully
      expect(result[1].parentUid).toBe('/');
    });

    it('should handle root folder (parentUid is /)', () => {
      const mockFolders: IKsmGetFoldersResponse[] = [
        {
          folderUid: '/',
          name: 'My Vault',
          parentUid: '/',
        },
      ];

      const result = ksmStorageManager.resolveFolderPaths(mockFolders);

      // The code always prepends "My Vault" to all folders, even the root
      expect(result[0].folderPath).toBe('My Vault / My Vault');
    });
  });
});
