import { window } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseGetValueHandler } from '../base/baseGetValueHandler';
import { CLI_FOLDER_SOURCE_LEGACY, CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER, CLI_RECORD_CATEGORY_CLASSIC, KEEPER_NOTATION_FIELD_TYPES } from '../../../utils/constants';
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
import { ICliListRecordResponse, ICliNsfListRecordResponse } from '../../../types';
import { CliStorageManager } from '../../storage/cliStorageManager';

export class CliGetValueHandler extends BaseGetValueHandler {
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

      /*
          IF current storage is "My Vault" (root folder), run BOTH nsf-list and list
          and combine their records into a single quick pick.
          IF NSF folder is selected, then run nsf-list --records --format json
          IF Legacy folder is selected, then run list --format json and filter
          only classic records.
      */

      const currentStorage = this.storageManager.getCurrentStorage();
      let processedAllRecords: IRecordQuickPick[] = [];

      if (currentStorage?.folderUid === '/') {
        // My Vault: fetch both NSF and classic records. CLI service blocks parallel
        // commands (see `isExecutingCommand` in services/cli.ts), so run sequentially.
        const nsfQuickPickItems = await this.fetchAndProcessNsfRecords();
        const classicQuickPickItems = await this.fetchAndProcessClassicRecords();
        processedAllRecords = [...nsfQuickPickItems, ...classicQuickPickItems];
      } else if (
        currentStorage?.source === CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER
      ) {
        processedAllRecords = await this.fetchAndProcessNsfRecords();
      } else if (currentStorage?.source === CLI_FOLDER_SOURCE_LEGACY) {
        processedAllRecords = await this.fetchAndProcessClassicRecords();
      }

      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.RETRIEVED_RECORDS_FROM_VAULT +
          `- ${processedAllRecords.length}`
      );

      this.spinner.hide();

      if (processedAllRecords.length === 0) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.NO_RECORDS_FOUND
        );
        window.showInformationMessage(CLI_SUCCESS_MESSAGES.NO_RECORDS_FOUND);
        return;
      }

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

  /**
   * Fetches records from a nested share folder via `nsf-list --records --format=json`
   * and maps them into quick-pick items.
   */
  private async fetchAndProcessNsfRecords(): Promise<IRecordQuickPick[]> {
    const nsfRecordsRaw = await this.cliService.executeCommanderCommand(
      'nsf-list',
      ['--records', '--format=json']
    );
    const nsfRecords: ICliNsfListRecordResponse[] = safeJsonParse(
      nsfRecordsRaw,
      []
    );

    return nsfRecords.map((record) => ({
      label: `${record.Title} (Nested)`, 
      value: record.UID,
    }));
  }

  /**
   * Fetches records from the classic vault via `list --format=json`, filters to
   * `Classic` records only, and maps them into quick-pick items.
   */
  private async fetchAndProcessClassicRecords(): Promise<IRecordQuickPick[]> {
    const classicRecordsRaw = await this.cliService.executeCommanderCommand(
      'list',
      ['--format=json']
    );
    const classicRecords: ICliListRecordResponse[] = safeJsonParse(
      classicRecordsRaw,
      []
    );

    return classicRecords
      .filter((record) => record.record_category === CLI_RECORD_CATEGORY_CLASSIC)
      .map((record) => ({
        label: `${record.title} (Classic)`,
        value: record.record_uid,
      }));
  }
}
