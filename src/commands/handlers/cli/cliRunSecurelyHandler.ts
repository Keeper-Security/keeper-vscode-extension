import { ExtensionContext, window } from 'vscode';
import { BaseRunSecurelyHandler } from '../base/baseRunSecurelyHandler';
import { safeJsonParse, StatusBarSpinner } from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import { IRecordData } from '../../../types/ksm';
import { CliService } from '../../../services/cli';
import {
  CLI_ERROR_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../utils/cli-messages';

export class CliRunSecurelyHandler extends BaseRunSecurelyHandler {
  constructor(
    context: ExtensionContext,
    private cliService: CliService,
    spinner: StatusBarSpinner
  ) {
    super(context, spinner);
  }
  async execute(): Promise<void> {
    try {
      if (!(await this.cliService.isCLIReady())) {
        logger.logError(
          this.constructor.name + ': ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
        );
        return;
      }

      this.executeRunSecurely(this.fetchSecretByRecordUid.bind(this));
    } catch (error) {
      logger.logError(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_ERROR_MESSAGES.SOMETHING_WENT_WRONG,
        error
      );
      window.showErrorMessage(CLI_ERROR_MESSAGES.FAILED_TO_RUN_SECURELY);
    } finally {
      this.spinner.hide();
    }
  }

  private async fetchSecretByRecordUid(
    recordUid: string
  ): Promise<IRecordData> {
    const record = await this.cliService.executeCommanderCommand('get', [
      recordUid,
      '--format=json',
    ]);

    // Use safe parser that cleans output first
    const parsedRecords = safeJsonParse(record, []);

    if (!parsedRecords || parsedRecords.length === 0) {
      throw new Error('Failed to fetch record data');
    }

    const recordDetails = parsedRecords[0];
    return recordDetails;
  }
}
