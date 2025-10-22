import { window } from 'vscode';
import { CliService } from '../../../services/cli';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../utils/cli-messages';
import { StatusBarSpinner } from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import { CliStorageManager } from '../../storage/cliStorageManager';
import { BaseChooseFolderHandler } from '../base/baseChooseFolderHandler';

export class CliChooseFolderHandler extends BaseChooseFolderHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private cliService: CliService,
    private storageManager: CliStorageManager
  ) {
    super();
  }
  async execute(): Promise<void> {
    try {
      if (!(await this.cliService.isCLIReady())) {
        logger.logError(
          this.constructor.name + ': ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
        );
        return;
      }

      this.spinner.show(CLI_INFO_MESSAGES.RETRIEVING_FOLDERS);

      return await this.storageManager.chooseFolder(
        this.storageManager.fetchAvailableFolders.bind(this.storageManager)
      );
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER}`,
        error
      );
      window.showErrorMessage(`${CLI_ERROR_MESSAGES.FAILED_TO_CHOOSE_FOLDER}`);
    } finally {
      this.spinner.hide();
    }
  }
}
