import { ExtensionContext } from 'vscode';
import { CliStorageManager } from '../../../../src/commands/storage/cliStorageManager';
import { CliService } from '../../../../src/services/cli';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { logger } from '../../../../src/utils/logger';
import { safeJsonParse } from '../../../../src/utils/helper';
import { ICliListFolderResponse, IFolder } from '../../../../src/types';
import { CLI_SOURCE_KEEPER_DRIVE } from '../../../../src/utils/constants';

// Mock dependencies
jest.mock('../../../../src/services/cli');
jest.mock('../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../src/utils/helper'),
  safeJsonParse: jest.fn(),
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

describe('CliStorageManager', () => {
  let mockContext: ExtensionContext;
  let mockCliService: jest.Mocked<CliService>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let cliStorageManager: CliStorageManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      subscriptions: [],
    } as unknown as ExtensionContext;

    mockCliService = {
      executeCommanderCommand: jest.fn(),
    } as unknown as jest.Mocked<CliService>;

    mockSpinner = {
      show: jest.fn(),
      updateMessage: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    cliStorageManager = new CliStorageManager(mockContext, mockSpinner, mockCliService);
  });

  describe('constructor', () => {
    it('should initialize with context, spinner, and cliService', () => {
      expect(cliStorageManager).toBeInstanceOf(CliStorageManager);
      expect(logger.logDebug).toHaveBeenCalledWith(
        'CliStorageManager: Initializing'
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

      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[{"uid":"123","folder_uid":"123","name":"Test Folder","parent_uid":"root-folder","details":"Test Folder, Parent:root-folder"}]'); // ls

      (safeJsonParse as jest.Mock).mockReturnValue([
        {
          uid: '123',
          folder_uid: '123',
          name: 'Test Folder',
          parent_uid: 'root-folder',
          details: 'Test Folder, Parent:root-folder',
        },
      ]);

      const result = await cliStorageManager.ensureValidStorage();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down');
      expect(result).toBe(true);
    });
  });

  describe('fetchAvailableFolders', () => {
    it('should fetch folders from CLI and return with root folder', async () => {
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[{"uid":"123","folder_uid":"123","name":"Folder 1","parent_uid":"/","details":"Folder 1, Parent:/"}]'); // ls

      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: 'Folder 1, Parent:/',
        },
      ];

      (safeJsonParse as jest.Mock).mockReturnValue(mockCliFolders);

      const result = await cliStorageManager.fetchAvailableFolders();

      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down');
      expect(logger.logDebug).toHaveBeenCalledWith(
        'CliStorageManager: Syncing down latest records from vault'
      );
      expect(logger.logDebug).toHaveBeenCalledWith('CliStorageManager: Sync down completed');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('ls', [
        '--format=json',
        '-f',
        '-R',
      ]);
      expect(logger.logDebug).toHaveBeenCalledWith('Fetching folders from Keeper vault');
      expect(safeJsonParse).toHaveBeenCalledWith(
        '[{"uid":"123","folder_uid":"123","name":"Folder 1","parent_uid":"/","details":"Folder 1, Parent:/"}]',
        []
      );
      expect(logger.logDebug).toHaveBeenCalledWith('Retrieved 1 folders from vault');

      expect(result.rootFolder).toEqual({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
        source: CLI_SOURCE_KEEPER_DRIVE,
      });
      expect(result.availableFolders.length).toBeGreaterThan(0);
      expect(result.availableFolders[0]).toEqual(result.rootFolder);
    });

    it('should handle empty folder list', async () => {
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[]'); // ls

      (safeJsonParse as jest.Mock).mockReturnValue([]);

      const result = await cliStorageManager.fetchAvailableFolders();

      expect(result.availableFolders).toEqual([result.rootFolder]);
      expect(result.rootFolder.folderUid).toBe('/');
    });

    it('should handle ls command errors', async () => {
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockRejectedValueOnce(new Error('LS failed')); // ls

      await expect(cliStorageManager.fetchAvailableFolders()).rejects.toThrow('LS failed');
    });

    it('should include root folder in available folders', async () => {
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[]'); // ls

      (safeJsonParse as jest.Mock).mockReturnValue([]);

      const result = await cliStorageManager.fetchAvailableFolders();

      expect(result.availableFolders).toHaveLength(1);
      expect(result.availableFolders[0].folderUid).toBe('/');
      expect(result.availableFolders[0].name).toBe('My Vault');
    });
  });

  describe('resolveFolderPaths', () => {
    it('should resolve simple folder paths', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: 'Folder 1, Parent:/',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        folderUid: '123',
        name: 'Folder 1',
        parentUid: '/',
        folderPath: 'My Vault / Folder 1',
      });
      expect(logger.logDebug).toHaveBeenCalledWith('Resolving paths for 1 folders');
      expect(logger.logDebug).toHaveBeenCalledWith('Resolved paths for 1 folders');
    });

    it('should resolve nested folder paths', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Parent Folder',
          parent_uid: '/',
          details: 'Parent Folder, Parent:/',
        },
        {
          uid: '456',
          folder_uid: '456',
          name: 'Child Folder',
          parent_uid: '123',
          details: 'Child Folder, Parent:123',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        folderUid: '123',
        name: 'Parent Folder',
        parentUid: '/',
        folderPath: 'My Vault / Parent Folder',
      });
      expect(result[1]).toEqual({
        folderUid: '456',
        name: 'Child Folder',
        parentUid: '123',
        folderPath: 'My Vault / Parent Folder / Child Folder',
      });
    });

    it('should handle missing parent in folder map', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '456',
          folder_uid: '456',
          name: 'Child Folder',
          parent_uid: '999', // Non-existent parent
          details: 'Child Folder, Parent:999',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        folderUid: '456',
        name: 'Child Folder',
        parentUid: '999',
        folderPath: 'My Vault / Child Folder',
      });
    });

    it('should handle missing details property', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: '',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        folderUid: '123',
        name: 'Folder 1',
        parentUid: '/',
        folderPath: 'My Vault / Folder 1',
      });
    });

    it('should handle details without Parent separator', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: 'Folder 1',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(1);
      expect(result[0].folderPath).toBe('My Vault / Folder 1');
    });

    it('should handle deeply nested folder structures', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '1',
          folder_uid: '1',
          name: 'Level 1',
          parent_uid: '/',
          details: 'Level 1, Parent:/',
        },
        {
          uid: '2',
          folder_uid: '2',
          name: 'Level 2',
          parent_uid: '1',
          details: 'Level 2, Parent:1',
        },
        {
          uid: '3',
          folder_uid: '3',
          name: 'Level 3',
          parent_uid: '2',
          details: 'Level 3, Parent:2',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result[2]).toEqual({
        folderUid: '3',
        name: 'Level 3',
        parentUid: '2',
        folderPath: 'My Vault / Level 1 / Level 2 / Level 3',
      });
    });

    it('should use uid field when mapping folder', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: 'different-uid',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: 'Folder 1, Parent:/',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result[0].folderUid).toBe('different-uid'); // Should use 'uid' not 'folder_uid'
    });

    it('should handle parent UID that is root', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Folder 1',
          parent_uid: '/',
          details: 'Folder 1, Parent:/',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      // When parent_uid is '/', the while loop should exit immediately
      expect(result[0].folderPath).toBe('My Vault / Folder 1');
    });

    it('should handle multiple folders with same parent', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '123',
          folder_uid: '123',
          name: 'Parent Folder',
          parent_uid: '/',
          details: 'Parent Folder, Parent:/',
        },
        {
          uid: '456',
          folder_uid: '456',
          name: 'Child 1',
          parent_uid: '123',
          details: 'Child 1, Parent:123',
        },
        {
          uid: '789',
          folder_uid: '789',
          name: 'Child 2',
          parent_uid: '123',
          details: 'Child 2, Parent:123',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result).toHaveLength(3);
      expect(result[1].folderPath).toBe('My Vault / Parent Folder / Child 1');
      expect(result[2].folderPath).toBe('My Vault / Parent Folder / Child 2');
    });

    it('should handle empty folder array', () => {
      const result = cliStorageManager.resolveFolderPaths([]);

      expect(result).toHaveLength(0);
      expect(logger.logDebug).toHaveBeenCalledWith('Resolving paths for 0 folders');
      expect(logger.logDebug).toHaveBeenCalledWith('Resolved paths for 0 folders');
    });

    it('should parse parent UID from details correctly', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '456',
          folder_uid: '456',
          name: 'Child Folder',
          parent_uid: '/',
          details: 'Child Folder, Parent:123',
        },
        {
          uid: '123',
          folder_uid: '123',
          name: 'Parent Folder',
          parent_uid: '/',
          details: 'Parent Folder, Parent:/',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      // First folder should use isParent:123 from details, not parent_uid
      const childFolder = result.find((f) => f.folderUid === '456');
      expect(childFolder?.folderPath).toBe('My Vault / Parent Folder / Child Folder');
    });

    it('should handle whitespace in details Parent value', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: '456',
          folder_uid: '456',
          name: 'Child Folder',
          parent_uid: '/',
          details: 'Child Folder, Parent: 123 ', // Extra spaces
        },
        {
          uid: '123',
          folder_uid: '123',
          name: 'Parent Folder',
          parent_uid: '/',
          details: 'Parent Folder, Parent:/',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      const childFolder = result.find((f) => f.folderUid === '456');
      expect(childFolder?.folderPath).toBe('My Vault / Parent Folder / Child Folder');
    });

    it('should resolve paths from real CLI JSON (uid + Flags details only)', () => {
      const mockCliFolders: ICliListFolderResponse[] = [
        {
          uid: 'G_qXL4pQ8Ebi-tewfu_iaQ',
          name: 'Engineering 2',
          parent_uid: '/',
          details: 'Flags: , Parent: /',
          source: 'KeeperDrive',
        },
        {
          uid: '6fnkWl6cOahMM5FVod4lSw',
          name: 'nested',
          parent_uid: '/',
          details: 'Flags: , Parent: G_qXL4pQ8Ebi-tewfu_iaQ',
          source: 'KeeperDrive',
        },
        {
          uid: 'AYAWw5zqQRasy9_ordJeKg',
          name: 'nested 2',
          parent_uid: '/',
          details: 'Flags: , Parent: 6fnkWl6cOahMM5FVod4lSw',
          source: 'KeeperDrive',
        },
      ];

      const result = cliStorageManager.resolveFolderPaths(mockCliFolders);

      expect(result.find((f) => f.name === 'nested')?.folderPath).toBe(
        'My Vault / Engineering 2 / nested'
      );
      expect(result.find((f) => f.name === 'nested 2')?.folderPath).toBe(
        'My Vault / Engineering 2 / nested / nested 2'
      );
    });
  });
});
