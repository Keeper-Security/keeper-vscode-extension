import { window } from 'vscode';
import { CliService } from '../../services/cli';
import { StatusBarSpinner } from '../../utils/helper';
import { BaseCommandHandler } from './base/baseCommandHandler';
import { StorageManager } from '../storage/storageManager';
import { logger } from '../../utils/logger';

export class ChooseFolderHandler extends BaseCommandHandler {

  constructor(
    private cliService: CliService,
    private spinner: StatusBarSpinner,
    private storageManager: StorageManager
  ) {
    super();
  }

  async execute(): Promise<void> {
    try {
      logger.logDebug('ChooseFolderHandler.execute called');

      if (!(await this.cliService.isCLIReady())) {
        logger.logDebug(
          'ChooseFolderHandler.execute: canExecute returned false, aborting'
        );
        return;
      }

      logger.logDebug('ChooseFolderHandler: Starting folder selection process');
      await this.storageManager.chooseFolder();
      logger.logDebug('ChooseFolderHandler: Folder selection completed');
    } catch (error) {
      logger.logError(
        `ChooseFolderHandler.execute failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
      window.showErrorMessage(
        `Failed to choose folder: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.spinner.hide();
    }
  }
}
