import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { IFolder } from '../../types';
import { logger } from '../../utils/logger';
import { commonQuickPickOptions, StatusBarSpinner } from '../../utils/helper';

export abstract class BaseStorageManager {
  constructor(
    protected context: ExtensionContext,
    protected spinner: StatusBarSpinner
  ) {
  logger.logDebug(this.constructor.name + ' initialized');
  }

  private async validateCurrentStorage(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<boolean> {
    logger.logDebug('Starting storage validation');
    this.spinner.show('Validating storage...');

    const currentStorage = this.getCurrentStorage();
    logger.logDebug(
      `Current storage: ${currentStorage ? currentStorage.name : 'null'}`
    );

    if (!currentStorage) {
      logger.logDebug('No current storage found');
      return false;
    }

    // check if current storage is a My Vault
    if (currentStorage.parentUid === '/') {
      logger.logDebug('Current storage is My Vault, validation successful');
      return true;
    }

    const { availableFolders } = await getAvailableFolders();

    const folderExists = availableFolders.some(
      (folder) => folder.folderUid === currentStorage.folderUid
    );

    logger.logDebug(`Folder "${currentStorage.name}" exists on keeper vault`);

    if (!folderExists) {
      logger.logError(
        `Folder "${currentStorage.name}" no longer exists on Keeper vault`
      );
      this.setCurrentStorage(null);
      return false;
    }

    logger.logDebug('Storage validation completed successfully');
    this.spinner.hide();
    return true;
  }

  async ensureValidStorage(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<void> {
    // if currentStorage is not set, choose a folder
    if (!this.getCurrentStorage()) {
      logger.logDebug(
        'No current storage found, prompting for folder selection'
      );
      await this.chooseFolder(getAvailableFolders);
    } else {
      logger.logDebug('Current storage exists, validating...');
      // Validate current storage
      const isFolderExistsOnKeeperVault =
        await this.validateCurrentStorage(getAvailableFolders);

      if (!isFolderExistsOnKeeperVault) {
        logger.logDebug(
          'Current storage validation failed, prompting for new selection'
        );
        // Show warning about invalid folder and prompt for new selection
        const shouldChooseNew = await window.showWarningMessage(
          'Previously selected folder is no longer available. Would you like to choose a new folder?',
          'Yes',
          'No'
        );
        if (shouldChooseNew === 'Yes') {
          await this.chooseFolder(getAvailableFolders);
        } else {
          logger.logDebug('User chose not to select new folder');
          return;
        }
      } else {
        logger.logDebug('Current storage validation successful');
      }
    }
  }

  async chooseFolder(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<void> {
    logger.logDebug('Starting folder selection process');

    // get all folders from vault
    this.spinner.show('Retrieving folders...');

    const { availableFolders, rootFolder } = await getAvailableFolders();
    this.spinner.hide();

    // if no folders available, automatically set root folder and skip quick pick
    // root folder + other folders
    if (availableFolders.length === 1) {
      logger.logDebug(
        `No folders available, automatically setting ${rootFolder.name} as storage`
      );
      this.setCurrentStorage(rootFolder);

      window.showInformationMessage(
        `Storage location set to "${rootFolder.name}" folder (no other folders available)`
      );
      logger.logDebug(
        `Storage location automatically set to: ${rootFolder.name}`
      );
      return;
    }

    // Only show quick pick if there are multiple folder options
    const formatedFoldersForQuickPick = availableFolders.map(
      (folder: IFolder) => {
        const response: QuickPickItem & { value: string } = {
          label: folder.name,
          value: folder.folderUid,
          picked: this.getCurrentStorage()?.folderUid === folder.folderUid,
        };
        if (folder.folderPath && folder.folderPath !== '/') {
          response.detail = `Path: ${folder.folderPath}`;
        }
        return response;
      }
    );

    // show picker for folders
    logger.logDebug('Showing folder selection picker');
    const selectedFolder = await window.showQuickPick(
      formatedFoldersForQuickPick,
      {
        title: 'Available folders',
        placeHolder:
          'Select a folder to use as storage location while saving secrets',
        ...commonQuickPickOptions,
      }
    );

    if (!selectedFolder) {
      logger.logDebug('No folder selected by user');
      return;
    }

    logger.logDebug(
      `User selected folder: ${selectedFolder.label} (${selectedFolder.value})`
    );

    // if folder is selected, set currentStorage to the folder
    const newStorage =
      availableFolders.find(
        (folder: IFolder) => folder.folderUid === selectedFolder.value
      ) || null;

    this.setCurrentStorage(newStorage);

    window.showInformationMessage(
      `Storage location set to "${selectedFolder.label}" folder`
    );
    logger.logDebug(`Storage location updated to: ${selectedFolder.label}`);
  }

  getCurrentStorage(): IFolder | null {
    const storage = this.context.workspaceState.get('currentStorage', null);
    logger.logDebug(
      `Retrieved current storage: ${storage ? (storage as IFolder)?.name : 'null'}`
    );
    return storage;
  }

  setCurrentStorage(storage: IFolder | null): void {
    logger.logDebug(
      `Setting current storage to: ${storage ? (storage as IFolder)?.name : 'null'}`
    );
    this.context.workspaceState.update('currentStorage', storage);
  }
}
