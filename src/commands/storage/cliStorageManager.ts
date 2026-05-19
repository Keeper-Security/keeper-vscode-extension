import { ExtensionContext } from 'vscode';
import { BaseStorageManager } from './baseStorageManager';
import { safeJsonParse, StatusBarSpinner } from '../../utils/helper';
import {
  ICliListFolderResponse,
  IFolder,
} from '../../types';
import { logger } from '../../utils/logger';
import { CliService } from '../../services/cli';
import { CLI_SOURCE_KEEPER_DRIVE } from '../../utils/constants';

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
      source: CLI_SOURCE_KEEPER_DRIVE,
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
