import { ExtensionContext } from 'vscode';
import { BaseStorageManager } from './baseStorageManager';
import { KsmService } from '../../services/ksm';
import { StatusBarSpinner } from '../../utils/helper';
import { IFolder, IKsmGetFoldersResponse } from '../../types';
import { logger } from '../../utils/logger';

export class KsmStorageManager extends BaseStorageManager {
  constructor(
    context: ExtensionContext,
    spinner: StatusBarSpinner,
    private ksmService: KsmService
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
    logger.logDebug('Fetching folders from Keeper vault');
    const folders = await this.ksmService.executeKsmCommand(() =>
      this.ksmService.getFolders()
    );

    logger.logDebug(`Retrieved ${folders.length} folders from vault`);

    const foldersWithPaths = this.resolveFolderPaths(folders);

    return {
      availableFolders: foldersWithPaths,
      rootFolder: foldersWithPaths[0],
    };
  }

  resolveFolderPaths(folders: IKsmGetFoldersResponse[]): IFolder[] {
    logger.logDebug(`Resolving paths for ${folders.length} folders`);
    // Map folderUid to folder for quick lookup
    const folderMap = new Map<string, IKsmGetFoldersResponse>();
    folders.forEach((folder) => folderMap.set(folder.folderUid, folder));

    const result = folders.map((folder) => {
      const pathParts: string[] = [folder.name];
      let currentParentUid = folder.parentUid || '/';

      while (currentParentUid !== '/') {
        const parent = folderMap.get(currentParentUid);
        if (!parent) {
          break;
        }
        pathParts.unshift(parent.name);
        currentParentUid = parent.parentUid || '/';
      }

      pathParts.unshift('My Vault');

      return {
        folderUid: folder.folderUid,
        name: folder.name,
        parentUid: folder.parentUid || '/',
        folderPath: pathParts.join(' / '),
        source: "", // TODO: add source , currenlty we are not fetting KD-Folder's from KSM
      };
    });

    logger.logDebug(`Resolved paths for ${result.length} folders`);
    return result;
  }
}
