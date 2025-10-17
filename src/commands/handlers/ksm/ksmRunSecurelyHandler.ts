import { ExtensionContext, window } from 'vscode';
import { BaseRunSecurelyHandler } from '../base/baseRunSecurelyHandler';
import { KsmService } from '../../../services/ksm';
import { StatusBarSpinner } from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import {
  KSM_ERROR_MESSAGES,
  KSM_LOGGER_ERROR_MESSAGES,
} from '../../../utils/ksm-messages';
import { IRecordData } from '../../../types/ksm';

export class KsmRunSecurelyHandler extends BaseRunSecurelyHandler {
  constructor(
    context: ExtensionContext,
    private ksmService: KsmService,
    spinner: StatusBarSpinner
  ) {
    super(context, spinner);
  }
  async execute(): Promise<void> {
    try {
      if (!(await this.ksmService.isKsmReady())) {
        logger.logError(
          this.constructor.name + ': ' + KSM_LOGGER_ERROR_MESSAGES.KSM_NOT_READY
        );
        return;
      }

      await this.executeRunSecurely(this.fetchSecretByRecordUid.bind(this));
    } catch (error) {
      logger.logError(
        this.constructor.name +
          ': ' +
          KSM_LOGGER_ERROR_MESSAGES.SOMETHING_WENT_WRONG,
        error
      );
      window.showErrorMessage(KSM_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY);
    } finally {
      this.spinner.hide();
    }
  }

  private async fetchSecretByRecordUid(
    recordUid: string
  ): Promise<IRecordData> {
    const record = await this.ksmService.executeKsmCommand(
      async () => await this.ksmService.getSecretByRecordUid(recordUid)
    );

    const { records } = record;
    const { data } = records[0];
    return data;
  }
}
