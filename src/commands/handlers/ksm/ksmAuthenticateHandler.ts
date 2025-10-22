import { window } from 'vscode';
import { KsmService } from '../../../services/ksm';
import { BaseCommandHandler } from '../base/baseCommandHandler';
import { logger } from '../../../utils/logger';
import { StatusBarSpinner } from '../../../utils/helper';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import {
  KSM_ERROR_MESSAGES,
  KSM_INFO_MESSAGES,
} from '../../../utils/ksm-messages';

export class KsmAuthenticateHandler extends BaseCommandHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private ksmService: KsmService,
    private storageManager: KsmStorageManager
  ) {
    super();
  }

  async execute(): Promise<void> {
    this.spinner.show(KSM_INFO_MESSAGES.AUTHENTICATING_WITH_KSM);
    try {
      const storeConfigPath = await this.ksmService.getStoreConfigPath();
      if (!storeConfigPath) {
        return;
      }

      await this.ksmService.handleReAuthentication(storeConfigPath);

      // clear current storage
      this.storageManager.setCurrentStorage(null);

      window.showInformationMessage(KSM_INFO_MESSAGES.AUTHENTICATED_WITH_KSM);
    } catch (error) {
      logger.logError(
        this.constructor.name + ': ' +
          KSM_ERROR_MESSAGES.FAILED_TO_AUTHENTICATE,
        error
      );
      window.showErrorMessage(
        KSM_ERROR_MESSAGES.FAILED_TO_AUTHENTICATE +
          ': ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
      return;
    } finally {
      this.spinner.hide();
    }
  }
}
