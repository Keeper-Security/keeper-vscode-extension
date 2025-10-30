import { ExtensionContext } from 'vscode';
import { BaseStorageManager } from './baseStorageManager';
import { safeJsonParse, StatusBarSpinner } from '../../utils/helper';
import {
  ICliListFolderResponse,
  IFolder,
} from '../../types';
import { logger } from '../../utils/logger';
import { CliService } from '../../services/cli';

export class CliStorageManager extends BaseStorageManager {
  constructor(
    context: ExtensionContext,
    spinner: StatusBarSpinner,
    private cliService: CliService
  ) {
    super(context, spinner);
  }

  async ensureValidStorage(): Promise<boolean> {
    return await super.ensureValidStorage(
      this.fetchAvailableFolders.bind(this)
    );
  }

  async fetchAvailableFolders(): Promise<{
    availableFolders: IFolder[];
    rootFolder: IFolder;
  }> {
    // Sync-down the latest records from the vault
    logger.logDebug(
      'CliStorageManager: Syncing down latest records from vault'
    );
    await this.cliService.executeCommanderCommand('sync-down');

    logger.logDebug('CliStorageManager: Sync down completed');

    logger.logDebug('Fetching folders from Keeper vault');

    const folders = await this.cliService.executeCommanderCommand('ls', [
      '--format=json',
      '-f',
      '-R',
    ]);

    const parsedFolders = safeJsonParse(folders, []);
    logger.logDebug(`Retrieved ${parsedFolders.length} folders from vault`);

    const rootFolder: IFolder = {
      folderUid: '/',
      name: 'My Vault',
      parentUid: '/',
      folderPath: '/',
    };

    const foldersWithPaths = [
      rootFolder,
      ...this.resolveFolderPaths(parsedFolders),
    ];
    return {
      availableFolders: foldersWithPaths,
      rootFolder,
    };
  }

  resolveFolderPaths(folders: ICliListFolderResponse[]): IFolder[] {
    logger.logDebug(`Resolving paths for ${folders.length} folders`);
    // Map folderUid to folder for quick lookup
    const folderMap = new Map<string, ICliListFolderResponse>();
    folders.forEach((folder) => folderMap.set(folder.folder_uid, folder));

    const result = folders.map((folder) => {
      const pathParts: string[] = [folder.name];
      let currentParentUid = folder?.details?.split(", Parent:")[1]?.trim();

      while (currentParentUid !== '/') {
        const parent = folderMap.get(currentParentUid);
        if (!parent) {
          break;
        }
        pathParts.unshift(parent.name);
        currentParentUid = parent.parent_uid;
      }

      pathParts.unshift('My Vault');

      return {
        folderUid: folder['uid'],
        name: folder['name'],
        parentUid: folder['parent_uid'],
        folderPath: pathParts.join(' / '),
      };
    });

    logger.logDebug(`Resolved paths for ${result.length} folders`);
    return result;
  }
}
