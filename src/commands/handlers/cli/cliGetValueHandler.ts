import { window } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseGetValueHandler } from '../base/baseGetValueHandler';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../utils/constants';
import {
  createKeeperReference,
  safeJsonParse,
  StatusBarSpinner,
} from '../../../utils/helper';
import { IRecordQuickPick } from '../../../types/ksm';
import {
  KSM_INFO_MESSAGES,
  KSM_LOGGER_DEBUG_MESSAGES,
  KSM_SUCCESS_MESSAGES,
} from '../../../utils/ksm-messages';
import { CliService } from '../../../services/cli';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../utils/cli-messages';
import { ICliListCommandResponse } from '../../../types';

export class CliGetValueHandler extends BaseGetValueHandler {
  constructor(
    private cliService: CliService,
    private spinner: StatusBarSpinner
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

      logger.logDebug(
        'CliGetValueHandler: Showing spinner for secret retrieval'
      );
      this.spinner.show(CLI_INFO_MESSAGES.RETRIEVING_SECRETS);

      // Sync-down the latest records from the vault
      logger.logDebug(
        'GetValueHandler: Syncing down latest records from vault'
      );
      await this.cliService.executeCommanderCommand('sync-down');

      // List available records
      logger.logDebug(
        'GetValueHandler: Executing list command to get available records'
      );
      const secrets = await this.cliService.executeCommanderCommand('list', [
        '--format=json',
      ]);
      // Use safe parser that cleans output first
      const allRecords: ICliListCommandResponse[] = safeJsonParse(secrets, []);
      logger.logDebug(
        `CliGetValueHandler: Retrieved ${allRecords.length} records from vault`
      );

      this.spinner.hide();

      if (!allRecords || allRecords.length === 0) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.NO_RECORDS_FOUND
        );
        window.showInformationMessage(KSM_SUCCESS_MESSAGES.NO_RECORDS_FOUND);
        return;
      }

      /**
       * Process all records to show in quick pick
       * label: record title
       * value: record uid
       */
      const processedAllRecords: IRecordQuickPick[] = allRecords.map(
        (record) => ({
          label: record.title,
          value: record.record_uid,
        })
      );

      const selectedRecord =
        await this.showQuickPickForRecords(processedAllRecords);

      if (!selectedRecord) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_SELECTION
        );
        return;
      }

      logger.logDebug(
        this.constructor.name +
          ': ' +
          KSM_LOGGER_DEBUG_MESSAGES.USER_SELECTED_RECORD +
          `- ${selectedRecord.value}`
      );

      this.spinner.show(KSM_INFO_MESSAGES.RETRIEVING_SECRET_DETAILS);

      const secret = await this.cliService.executeCommanderCommand('get', [
        selectedRecord.value,
        '--format=json',
      ]);

      // Use safe parser that cleans output first
      const selectedRecordData = safeJsonParse(secret, [])[0];
      logger.logDebug(
        `GetValueHandler: Retrieved record details with ${selectedRecordData.fields?.length || 0} fields and ${selectedRecordData.custom?.length || 0} custom fields`
      );

      this.spinner.hide();

      if (!selectedRecordData || selectedRecordData.length === 0) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID +
            `- ${selectedRecord.value}`
        );
        window.showInformationMessage(
          KSM_INFO_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID +
            `- ${selectedRecord.value}`
        );
        return;
      }

      // process fields
      const fields = this.processFieldsData(
        selectedRecordData.fields ?? [],
        KEEPER_NOTATION_FIELD_TYPES.FIELD
      );

      // process custom fields
      const customFields = this.processFieldsData(
        selectedRecordData.custom ?? [],
        KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD
      );

      const fieldsToShow = [...fields, ...customFields];

      // show quick pick with fileds and custom fields for selected record
      const selectedField = await this.showQuickPickForSelectedRecord(
        selectedRecord,
        fieldsToShow
      );
      if (!selectedField) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION
        );
        return;
      }

      const recordRef = createKeeperReference(
        selectedRecord.value.trim(),
        selectedField.fieldType,
        selectedField.label
      );
      if (!recordRef) {
        logger.logError(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
            `- ${selectedRecord.label}`
        );
        throw new Error(CLI_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE);
      }

      const isInserted =
        await this.insertKeeperRefInActiveTextEditor(recordRef);

      if (isInserted) {
        this.showFunctionalitySuccessMessage(selectedRecord, selectedField);
      }
    } catch (error) {
      logger.logError(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_ERROR_MESSAGES.SOMETHING_WENT_WRONG,
        error
      );
      window.showErrorMessage(CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE);
      return;
    } finally {
      this.spinner.hide();
    }
  }
}
