import { ExtensionContext } from 'vscode';
import { BaseStorageManager } from './baseStorageManager';
import { safeJsonParse, StatusBarSpinner } from '../../utils/helper';
import {
  ICliGetFolderResponse,
  ICliListFolderResponse,
  IFolder,
} from '../../types';
import { logger } from '../../utils/logger';
import { CliService } from '../../services/cli';
import { CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER } from '../../utils/constants';

function parseParentUidFromDetails(details?: string): string | undefined {
  if (!details?.includes(', Parent:')) {
    return undefined;
  }
  return details.split(', Parent:')[1]?.trim();
}

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
      this.fetchAvailableFolders.bind(this),
      this.getFolderByUid.bind(this)
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
    await this.cliService.executeCommanderCommand('sync-down --force');

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
      source: CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER,
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

  // this method is used to get a folder by uid, it is used to validate the current storage when user selects a folder from the quick pick only
  async getFolderByUid(uid: string): Promise<{
    availableFolders: IFolder[];
    rootFolder: IFolder;
  }> {
    // Sync-down the latest records from the vault
    logger.logDebug(
      'CliStorageManager: Syncing down latest records from vault'
    );
    await this.cliService.executeCommanderCommand('sync-down --force');

    logger.logDebug('CliStorageManager: Sync down completed');

    logger.logDebug('Fetching folder by uid from Keeper vault');

    const folderResponse = await this.cliService.executeCommanderCommand(
      'get',
      [`${uid}`, '--format=json']
    );

    const parsedFolder: ICliGetFolderResponse[] = safeJsonParse(
      folderResponse,
      []
    );
    logger.logDebug(`Retrieved folder by uid (${uid}) from vault`);

    const rootFolder: IFolder = {
      folderUid: '/',
      name: 'My Vault',
      parentUid: '/',
      folderPath: '/',
      source: CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER,
    };

    const updatedParsedFolder = parsedFolder.map((folder) => {
      // in below return we dont care about parentUid, folderPath, source because we are only using folderUid to check if the folder is valid or not
      // So those fields are set to empty string and CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER
      return {
        folderUid : folder.shared_folder_uid ? folder.shared_folder_uid : folder.folder_uid,
        name: folder.name,
        parentUid: "",
        folderPath: '',
        source: CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER,
      };
    });

    return {
      availableFolders: updatedParsedFolder,
      rootFolder,
    };
  }

  resolveFolderPaths(folders: ICliListFolderResponse[]): IFolder[] {
    logger.logDebug(`Resolving paths for ${folders.length} folders`);
    const folderMap = new Map<string, ICliListFolderResponse>();
    folders.forEach((folder) => folderMap.set(folder.uid, folder));

    const result = folders.map((folder) => {
      const pathParts: string[] = [folder.name];
      let currentParentUid = parseParentUidFromDetails(folder.details);

      while (currentParentUid && currentParentUid !== '/') {
        const parent = folderMap.get(currentParentUid);
        if (!parent) {
          break;
        }
        pathParts.unshift(parent.name);
        currentParentUid = parseParentUidFromDetails(parent.details);
      }

      pathParts.unshift('My Vault');

      return {
        folderUid: folder.uid,
        name: folder.name,
        parentUid: parseParentUidFromDetails(folder.details) ?? '/',
        folderPath: pathParts.join(' / '),
        source: folder.source,
      };
    });

    logger.logDebug(`Resolved paths for ${result.length} folders`);
    return result;
  }
}
