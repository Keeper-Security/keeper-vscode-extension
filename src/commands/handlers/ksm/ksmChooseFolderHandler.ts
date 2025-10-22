import { KsmService } from '../../../services/ksm';
import { StatusBarSpinner } from '../../../utils/helper';
import {
  KSM_INFO_MESSAGES,
  KSM_LOGGER_ERROR_MESSAGES,
} from '../../../utils/ksm-messages';
import { logger } from '../../../utils/logger';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { BaseChooseFolderHandler } from '../base/baseChooseFolderHandler';

export class KsmChooseFolderHandler extends BaseChooseFolderHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private ksmService: KsmService,
    private storageManager: KsmStorageManager
  ) {
    super();
  }
  async execute(): Promise<void> {
    try {
      if (!(await this.ksmService.isKsmReady())) {
        logger.logError(
          this.constructor.name + ': ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY
        );
        return;
      }
      this.spinner.show(KSM_INFO_MESSAGES.RETRIEVING_FOLDERS);
      return await this.storageManager.chooseFolder(
        this.storageManager.fetchAvailableFolders.bind(this.storageManager)
      );
    } catch (error) {
      logger.logError(
        `KsmChooseFolderHandler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    } finally {
      this.spinner.hide();
    }
  }
}
