import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { IFolder } from '../../types';
import { logger } from '../../utils/logger';
import { commonQuickPickOptions, StatusBarSpinner } from '../../utils/helper';
import { BASE_HANDLER_MESSAGES } from '../../utils/constants';

export abstract class BaseStorageManager {
  constructor(
    protected context: ExtensionContext,
    protected spinner: StatusBarSpinner
  ) {
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INITIALIZING
    );
  }

  private async validateCurrentStorage(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<boolean> {
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.STARTING_STORAGE_VALIDATION
    );
    this.spinner.show(BASE_HANDLER_MESSAGES.INFO.VALIDATING_STORAGE);

    const currentStorage = this.getCurrentStorage();
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.CURRENT_STORAGE +
        ' with value: ' +
        (currentStorage?.name ?? 'null')
    );

    if (!currentStorage) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_CURRENT_STORAGE_FOUND
      );
      return false;
    }

    // check if current storage is a My Vault
    if (currentStorage.parentUid === '/') {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.CURRENT_STORAGE_IS_MY_VAULT
      );
      return true;
    }

    const { availableFolders } = await getAvailableFolders();

    const folderExists = availableFolders.some(
      (folder) => folder.folderUid === currentStorage.folderUid
    );

    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.FOLDER_EXISTS_ON_KEEPER_VAULT +
        ' with value: ' +
        currentStorage.name
    );

    if (!folderExists) {
      logger.logError(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_ERROR
            .FOLDER_NO_LONGER_EXISTS_ON_KEEPER_VAULT +
          ' with value: ' +
          currentStorage.name
      );
      this.setCurrentStorage(null);

      this.spinner.hide();
      return false;
    }

    this.spinner.hide();
    return true;
  }

  async ensureValidStorage(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<boolean> {
    // if currentStorage is not set, choose a folder
    if (!this.getCurrentStorage()) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_CURRENT_STORAGE_FOUND +
          ', prompting for folder selection'
      );
      await this.chooseFolder(getAvailableFolders);

      // need this condition to handle the case where we prompted user to select a new folder and no folder is selected ( early return )
      return this.getCurrentStorage() !== null;
    } else {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.CURRENT_STORAGE_EXISTS +
          ', validating...'
      );
      // Validate current storage
      const isFolderExistsOnKeeperVault =
        await this.validateCurrentStorage(getAvailableFolders);

      if (!isFolderExistsOnKeeperVault) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            BASE_HANDLER_MESSAGES.LOGGER_DEBUG
              .CURRENT_STORAGE_VALIDATION_FAILED +
            ', prompting for new selection'
        );
        // Show warning about invalid folder and prompt for new selection
        const shouldChooseNew = await window.showWarningMessage(
          BASE_HANDLER_MESSAGES.INPUT
            .PREVIOUSLY_SELECTED_FOLDER_IS_NO_LONGER_AVAILABLE,
          'Yes',
          'No'
        );
        if (shouldChooseNew === 'Yes') {
          await this.chooseFolder(getAvailableFolders);

          // need this condition to handle the case where we prompted user to select a new folder and no folder is selected ( early return )
          return this.getCurrentStorage() !== null;
        } else {
          logger.logDebug(
            this.constructor.name +
              ': ' +
              BASE_HANDLER_MESSAGES.LOGGER_DEBUG
                .USER_CHOSE_NOT_TO_SELECT_NEW_FOLDER
          );

          return false;
        }
      }
      return true;
    }
  }

  async chooseFolder(
    getAvailableFolders: () => Promise<{
      availableFolders: IFolder[];
      rootFolder: IFolder;
    }>
  ): Promise<void> {
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.STARTING_FOLDER_SELECTION_PROCESS
    );

    // get all folders from vault
    this.spinner.show(BASE_HANDLER_MESSAGES.INFO.RETRIEVING_FOLDERS);

    const { availableFolders, rootFolder } = await getAvailableFolders();
    this.spinner.hide();

    // if no folders available, automatically set root folder and skip quick pick
    // root folder + other folders
    if (availableFolders.length === 1) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_FOLDERS_AVAILABLE +
          `automatically setting ${rootFolder.name} as storage`
      );
      this.setCurrentStorage(rootFolder);

      window.showInformationMessage(
        BASE_HANDLER_MESSAGES.INFO.STORAGE_LOCATION_AUTOMATICALLY_SET_TO +
          ' ' +
          rootFolder.name +
          ' folder (no other folders available)'
      );
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG
            .STORAGE_LOCATION_AUTOMATICALLY_SET_TO +
          ' ' +
          rootFolder.name
      );
      return;
    }

    // Only show quick pick if there are multiple folder options
    const formatedFoldersForQuickPick = availableFolders.map(
      (folder: IFolder) => {
        const isCurrentStorage =
          this.getCurrentStorage()?.folderUid === folder.folderUid;
        const response: QuickPickItem & { value: string } = {
          label: isCurrentStorage ? `${folder.name} ✓` : folder.name,
          value: folder.folderUid,
        };
        if (folder.folderPath && folder.folderPath !== '/') {
          response.detail = `Path: ${folder.folderPath}`;
        }
        return response;
      }
    );

    const selectedFolder = await window.showQuickPick(
      formatedFoldersForQuickPick,
      {
        title:
          BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_FOLDER_SELECTION_TITLE,
        placeHolder:
          BASE_HANDLER_MESSAGES.INPUT
            .QUICK_PICK_FOR_FOLDER_SELECTION_PLACEHOLDER,
        ...commonQuickPickOptions,
      }
    );

    if (!selectedFolder) {
      logger.logDebug(
        this.constructor.name +
          ': ' +
          BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_FOLDER_SELECTED_BY_USER
      );
      return;
    }

    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_SELECTED_FOLDER +
        ' with value: ' +
        selectedFolder.label +
        ' and ' +
        selectedFolder.value
    );

    // if folder is selected, set currentStorage to the folder
    const newStorage =
      availableFolders.find(
        (folder: IFolder) => folder.folderUid === selectedFolder.value
      ) || null;

    this.setCurrentStorage(newStorage);

    window.showInformationMessage(
      BASE_HANDLER_MESSAGES.INFO.STORAGE_LOCATION_SET_TO +
        ' ' +
        selectedFolder.label +
        ' folder'
    );
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.STORAGE_LOCATION_UPDATED_TO +
        ' with value: ' +
        selectedFolder.label
    );
  }

  getCurrentStorage(): IFolder | null {
    const storage = this.context.workspaceState.get('currentStorage', null);
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.RETRIEVED_CURRENT_STORAGE +
        ' with value: ' +
        (storage ? (storage as IFolder)?.name : 'null')
    );
    return storage;
  }

  setCurrentStorage(storage: IFolder | null): void {
    logger.logDebug(
      this.constructor.name +
        ': ' +
        BASE_HANDLER_MESSAGES.LOGGER_DEBUG.SETTING_CURRENT_STORAGE +
        ' with value: ' +
        (storage ? (storage as IFolder)?.name : 'null')
    );
    this.context.workspaceState.update('currentStorage', storage);
  }
}
