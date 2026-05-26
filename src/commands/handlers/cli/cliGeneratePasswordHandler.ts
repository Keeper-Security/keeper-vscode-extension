import { window } from 'vscode';
import { createKeeperReference, StatusBarSpinner } from '../../../utils/helper';
import { BaseGeneratePasswordHandler } from '../base/baseGeneratePasswordHandler';
import { logger } from '../../../utils/logger';
import {
  CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER,
  KEEPER_NOTATION_FIELD_TYPES,
  KEEPER_RECORD_TYPES,
} from '../../../utils/constants';
import { CliService } from '../../../services/cli';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
} from '../../../utils/cli-messages';
import { CliStorageManager } from '../../storage/cliStorageManager';

export class CliGeneratePasswordHandler extends BaseGeneratePasswordHandler {
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

      const recordName = await this.getRecordNameFromUser();
      if (!recordName) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT
        );
        return;
      }

      logger.logDebug(
        this.constructor.name +
          ': ' +
          CLI_LOGGER_DEBUG_MESSAGES.ENSURING_VALID_STORAGE
      );
      if (!(await this.storageManager.ensureValidStorage())) {
        return;
      }

      this.spinner.show(CLI_INFO_MESSAGES.GENERATING_PASSWORD);

      const currentStorage = this.storageManager.getCurrentStorage();

      const args = [
        `--title="${recordName}"`,
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        `"password"=$GEN`,
      ];

      // Dynamically determine the record command to execute based on the current storage source
      let recordCommandToExecute = 'record-add';

      // if currentStorage source is KeeperDrive, then use nsf-record-add command or default record-add command
      if(currentStorage?.source === CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER) {
        recordCommandToExecute = 'nsf-record-add';
      }

      // if currentStorage is not "My Vault", then add folder to args
      if (currentStorage?.folderUid !== '/') {
        args.push(`--folder="${currentStorage?.folderUid}"`);
      }

      const recordUid = await this.cliService.executeCommanderCommand(
        recordCommandToExecute, 
        args
      );

      const recordRef = createKeeperReference(
        recordUid.trim(),
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'password'
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

      const isInserted =
        await this.insertKeeperRefInActiveTextEditor(recordRef);

      if (isInserted) {
        this.showFunctionalitySuccessMessage(currentStorage?.name);
      }
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`,
        error
      );
      window.showErrorMessage(
        `${CLI_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`
      );
    } finally {
      this.spinner.hide();
    }
  }
}
