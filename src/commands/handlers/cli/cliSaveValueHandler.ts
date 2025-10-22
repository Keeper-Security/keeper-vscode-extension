import { Range, Uri, window } from 'vscode';
import { BaseSaveValueHandler } from '../base/baseSaveValueHandler';
import { CliService } from '../../../services/cli';
import { createKeeperReference, StatusBarSpinner } from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import {
  CLI_LOGGER_DEBUG_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_ERROR_MESSAGES,
} from '../../../utils/cli-messages';
import { CliStorageManager } from '../../storage/cliStorageManager';
import {
  KEEPER_NOTATION_FIELD_TYPES,
  KEEPER_RECORD_TYPES,
} from '../../../utils/constants';

export class CliSaveValueHandler extends BaseSaveValueHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private cliService: CliService,
    private storageManager: CliStorageManager
  ) {
    super();
  }

  async execute(
    secretValue?: string,
    range?: Range,
    documentUri?: Uri
  ): Promise<void> {
    try {
      const selectedText = await this.getSelectedText(
        secretValue,
        range,
        documentUri
      );
      if (!selectedText) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.NO_VALUE_FOUND_TO_SAVE
        );
        window.showErrorMessage(CLI_ERROR_MESSAGES.NO_VALUE_FOUND_TO_SAVE);
        return;
      }

      if (!(await this.cliService.isCLIReady())) {
        logger.logError(
          this.constructor.name + ': ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
        );
        return;
      }

      const recordName = await this.getRecordNameFromUser();
      if (!recordName) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT
        );
        return;
      }
      const recordFieldName = await this.getSecretFieldNameFromUser();
      if (!recordFieldName) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION
        );
        return;
      }

      if (!(await this.storageManager.ensureValidStorage())) {
        return;
      }

      this.spinner.show(CLI_INFO_MESSAGES.SAVING_SECRET);

      const currentStorage = this.storageManager.getCurrentStorage();

      /**
       *
       * [<FIELD_SET>][<FIELD_TYPE>][<FIELD_LABEL>]=[FIELD_VALUE]
       *
       * `"c.${this.getFieldType(recordFieldName)}.${recordFieldName}"="${selectedText}"`
       *
       * Create custom field with detect recordFieldName that can be secret or text
       */

      const args = [
        `--title="${recordName}"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"c.${this.getFieldType(recordFieldName)}.${recordFieldName}"="${selectedText}"`,
      ];

      // if currentStorage is not "My Vault", then add folder to args
      if (currentStorage?.folderUid !== '/') {
        args.push(`--folder="${currentStorage?.folderUid}"`);
      }

      const recordUid = await this.cliService.executeCommanderCommand(
        'record-add',
        args
      );

      // Create a Keeper Notation reference for the secret
      const recordRef = createKeeperReference(
        recordUid.trim(),
        KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD,
        recordFieldName
      );
      if (!recordRef) {
        logger.logError(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
            `- ${recordName}`
        );
        throw new Error(
          CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE
        );
      }

      const isInserted = await this.insertKeeperRefInActiveTextEditor(
        recordRef,
        range
      );

      if (isInserted) {
        this.showFunctionalitySuccessMessage(currentStorage?.name);
      }
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${CLI_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET}`,
        error
      );
      window.showErrorMessage(`${CLI_ERROR_MESSAGES.FAILED_TO_SAVE_SECRET}`);
    } finally {
      this.spinner.hide();
    }
  }
}
