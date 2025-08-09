import { ExtensionContext, window, QuickPickItem } from "vscode";
import { CliService } from "../../services/cli";
import { ICurrentStorage, IFolder } from "../../types";
import { resolveFolderPaths } from "../../utils/helper";
import { logger } from "../../utils/logger";
import { StatusBarSpinner } from "../../utils/helper";

export class StorageManager {
    constructor(
        private context: ExtensionContext, 
        private cliService: CliService,
        private spinner: StatusBarSpinner
    ) {}

    async validateCurrentStorage(): Promise<boolean> {
        try {
            this.spinner.show("Validating storage...");

            const currentStorage = this.getCurrentStorage();
            if (!currentStorage) {
                return false;
            }

            // check if current storage is a My Vault
            if (currentStorage.folderUid === "/") {
                return true;
            }

            // Fetch all folders from server
            const allAvailableFolders = await this.cliService.executeCommanderCommand('ls', ['--format=json', '-f', '-R']);
            const parsedFolders = JSON.parse(allAvailableFolders);

            // Check if stored folder still exists
            const folderExists = parsedFolders.some((folder: any) =>
                folder.folder_uid === currentStorage.folderUid
            );

            if (!folderExists) {
                logger.logError(`Folder "${currentStorage.name}" no longer exists on Keeper vault`);
                this.setCurrentStorage(null);
                return false;
            }

            return true;
        } catch (error) {
            logger.logError('Failed to validate current storage:', error);
            return false;
        } finally {
            this.spinner.hide();
        }
    }

    async ensureValidStorage(): Promise<void> {
        // if currentStorage is not set, choose a folder
        if (!this.getCurrentStorage()) {
            await this.chooseFolder();
        } else {
            // Validate current storage
            const isFolderExistsOnKeeperVault = await this.validateCurrentStorage();
            if (!isFolderExistsOnKeeperVault) {
                // Show warning about invalid folder and prompt for new selection
                const shouldChooseNew = await window.showWarningMessage(
                    'Previously selected folder is no longer available. Would you like to choose a new folder?',
                    'Yes', 'No'
                );
                if (shouldChooseNew === 'Yes') {
                    await this.chooseFolder();
                } else {
                    return;
                }
            }
        }
    }

    async chooseFolder(): Promise<void> {
        try {
            // Check authentication first
            if (!await this.cliService.isCLIReady()) {
                return;
            }

            // get all folders from vault 
            this.spinner.show("Retrieving folders...");

            const allAvailableFolders = await this.cliService.executeCommanderCommand('ls', ['--format=json', '-f', '-R']);
            this.spinner.hide();

            const parsedFolders = JSON.parse(allAvailableFolders);

            const rootVault: ICurrentStorage = {
                folderUid: "/",
                name: "My Vault",
                parentUid: "/",
                folderPath: "/"
            };
            const allAvailableFoldersWithPaths = [rootVault, ...resolveFolderPaths(parsedFolders)];

            const formatedFoldersForQuickPick = allAvailableFoldersWithPaths.map((folder: ICurrentStorage) => {
                const response: QuickPickItem & { value: string } = {
                    label: folder.name,
                    value: folder.folderUid,
                    picked: this.getCurrentStorage()?.folderUid === folder.folderUid,
                };
                if (folder.folderPath && folder.folderPath !== "/") {
                    response.detail = `📁 Path: ${folder.folderPath}`;
                }
                return response;
            });

            // show picker for folders
            const selectedFolder = await window.showQuickPick(formatedFoldersForQuickPick, { 
                title: 'Available folders from Keeper Vault', 
                placeHolder: 'Select a folder to use as storage location while saving secrets', 
                matchOnDetail: true, 
                ignoreFocusOut: true 
            });
            
            if (!selectedFolder) {
                return;
            }

            // if folder is selected, set currentStorage to the folder
            const newStorage = allAvailableFoldersWithPaths.find((folder: IFolder) => folder.folderUid === selectedFolder.value) || null;
            this.setCurrentStorage(newStorage);

            window.showInformationMessage(`Storage location set to "${selectedFolder.label}" folder`);

        } catch (error: any) {
            window.showErrorMessage(`Failed to choose folder: ${error.message}`);
        } finally {
            this.spinner.hide();
        }
    }

    getCurrentStorage(): ICurrentStorage | null {
        return this.context.workspaceState.get('currentStorage', null);
    }

    setCurrentStorage(storage: ICurrentStorage | null): void {
        this.context.workspaceState.update('currentStorage', storage);
    }
} 