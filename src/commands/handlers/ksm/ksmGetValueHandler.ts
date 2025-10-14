import { window } from 'vscode';
import { KsmService } from '../../../services/ksm';
import { logger } from '../../../utils/logger';
import { BaseGetValueHandler } from '../base/baseGetValueHandler';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../utils/constants';
import { createKeeperReference, StatusBarSpinner } from '../../../utils/helper';
import { IRecordQuickPick } from '../../../types/ksm';
import {
  KSM_ERROR_MESSAGES,
  KSM_INFO_MESSAGES,
  KSM_LOGGER_DEBUG_MESSAGES,
  KSM_LOGGER_ERROR_MESSAGES,
  KSM_SUCCESS_MESSAGES,
} from '../../../utils/ksm-messages';

export class KsmGetValueHandler extends BaseGetValueHandler {
  constructor(
    private ksmService: KsmService,
    private spinner: StatusBarSpinner
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

      this.spinner.show(KSM_INFO_MESSAGES.RETRIEVING_SECRETS);

      // fetch all records
      const secrets = await this.ksmService.executeKsmCommand(
        async () => await this.ksmService.getSecrets()
      );
      const { records: allRecords } = secrets;

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
          label: record.data.title,
          value: record.recordUid,
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

      const secret = await this.ksmService.executeKsmCommand(
        async () =>
          await this.ksmService.getSecretByRecordUid(selectedRecord.value)
      );

      const { records: selectedRecordData } = secret;

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
      const { data } = selectedRecordData[0];

      // process fields
      const fields = this.processFieldsData(
        data.fields,
        KEEPER_NOTATION_FIELD_TYPES.FIELD
      );

      // process custom fields
      const customFields = this.processFieldsData(
        data.custom,
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
            KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
            `- ${selectedRecord.label}`
        );
        throw new Error(KSM_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE);
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
          KSM_LOGGER_ERROR_MESSAGES.SOMETHING_WENT_WRONG,
        error
      );
      window.showErrorMessage(KSM_ERROR_MESSAGES.FAILED_TO_GET_VALUE);
      return;
    } finally {
      this.spinner.hide();
    }
  }
}
