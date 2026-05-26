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
import { CliService } from '../../../services/cli';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
  CLI_SUCCESS_MESSAGES,
} from '../../../utils/cli-messages';
import { ICliListRecordResponse } from '../../../types';

export class CliGetValueHandler extends BaseGetValueHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private cliService: CliService
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

      this.spinner.show(CLI_INFO_MESSAGES.RETRIEVING_SECRETS);

      // Sync-down the latest records from the vault
      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.SYNCING_DOWN_LATEST_RECORDS_FROM_VAULT
      );
      await this.cliService.executeCommanderCommand('sync-down --force');

      // List available records
      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.EXECUTING_LIST_COMMAND_TO_GET_AVAILABLE_RECORDS
      );

      // TODO: 1. run nsf-list --records --format json if selected storage is nested share folder else current implementation
      // 2. for record display title add NSF or Legacy suffix
      const secrets = await this.cliService.executeCommanderCommand('list', [
        '--format=json',
      ]);
      // Use safe parser that cleans output first
      const allRecords: ICliListRecordResponse[] = safeJsonParse(secrets, []);
      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.RETRIEVED_RECORDS_FROM_VAULT +
          `- ${allRecords.length}`
      );

      this.spinner.hide();

      if (!allRecords || allRecords.length === 0) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.NO_RECORDS_FOUND
        );
        window.showInformationMessage(CLI_SUCCESS_MESSAGES.NO_RECORDS_FOUND);
        return;
      }

      /**
       * Process all records to show in quick pick
       * label: record title
       * value: record uid
       */
      const processedAllRecords: IRecordQuickPick[] = allRecords.map(
        (record) => ({
          label: `${record.title} (${record.record_category})`,
          value: record.record_uid,
        })
      );

      const selectedRecord =
        await this.showQuickPickForRecords(processedAllRecords);

      if (!selectedRecord) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_SELECTION
        );
        return;
      }

      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.USER_SELECTED_RECORD +
          `- ${selectedRecord.value}`
      );

      this.spinner.show(CLI_INFO_MESSAGES.RETRIEVING_SECRET_DETAILS);

      const secret = await this.cliService.executeCommanderCommand('get', [
        selectedRecord.value,
        '--format=json',
      ]);

      // Use safe parser that cleans output first
      const selectedRecordData = safeJsonParse(secret, [])[0];
      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.RETRIEVED_RECORD_DETAILS +
          `- for record UID: ${selectedRecord.value}`
      );

      this.spinner.hide();

      if (!selectedRecordData || selectedRecordData.length === 0) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID +
            `- ${selectedRecord.value}`
        );
        window.showInformationMessage(
          CLI_INFO_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID +
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

      if (fieldsToShow.length === 0) {
        window.showInformationMessage(CLI_INFO_MESSAGES.NO_FIELDS_TO_SHOW);
        return;
      }

      // show quick pick with fields and custom fields for selected record
      const selectedField = await this.showQuickPickForSelectedRecord(
        selectedRecord,
        fieldsToShow
      );
      if (!selectedField) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION
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
        this.constructor.name + ': ' + CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE,
        error
      );
      window.showErrorMessage(CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE);
      return;
    } finally {
      this.spinner.hide();
    }
  }
}
