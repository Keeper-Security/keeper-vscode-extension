import { window } from 'vscode';
import { KsmService } from '../../../services/ksm';
import { createKeeperReference, StatusBarSpinner } from '../../../utils/helper';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { BaseGeneratePasswordHandler } from '../base/baseGeneratePasswordHandler';
import { logger } from '../../../utils/logger';
import {
  KSM_ERROR_MESSAGES,
  KSM_INFO_MESSAGES,
  KSM_LOGGER_DEBUG_MESSAGES,
  KSM_LOGGER_ERROR_MESSAGES,
} from '../../../utils/ksm-messages';
import {
  CreateOptions,
  generatePassword,
} from '@keeper-security/secrets-manager-core';
import {
  KEEPER_FIELD_TYPES,
  KEEPER_NOTATION_FIELD_TYPES,
  KEEPER_RECORD_TYPES,
} from '../../../utils/constants';

export class KsmGeneratePasswordHandler extends BaseGeneratePasswordHandler {
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

      const recordName = await this.getRecordNameFromUser();
      if (!recordName) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_NAME_INPUT
        );
        return;
      }

      logger.logDebug(
        this.constructor.name +
          ': ' +
          KSM_LOGGER_DEBUG_MESSAGES.ENSURING_VALID_STORAGE
      );
      if (!(await this.storageManager.ensureValidStorage())) {
        return;
      }

      this.spinner.show(KSM_INFO_MESSAGES.GENERATING_PASSWORD);

      const folders = await this.ksmService.executeKsmCommand(() =>
        this.ksmService.getFolders()
      );

      const sharedRootFolderUid = folders[0]?.folderUid;

      const currentStorage = this.storageManager.getCurrentStorage();

      const createOptions: CreateOptions = {
        folderUid: sharedRootFolderUid,
        subFolderUid: currentStorage?.folderUid,
      };

      const newRec = {
        title: recordName,
        type: KEEPER_RECORD_TYPES.LOGIN,
        fields: [
          {
            type: KEEPER_FIELD_TYPES.PASSWORD,
            value: [await generatePassword()],
          },
        ],
      };

      const newRecordUid = await this.ksmService.executeKsmCommand(() =>
        this.ksmService.createSecret(createOptions, newRec)
      );

      const recordRef = createKeeperReference(
        newRecordUid.trim(),
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'password'
      );
      if (!recordRef) {
        logger.logError(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
            `- ${recordName}`
        );
        throw new Error(
          KSM_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE
        );
      }

      const isInserted =
        await this.insertKeeperRefInActiveTextEditor(recordRef);

      if (isInserted) {
        this.showFunctionalitySuccessMessage(currentStorage?.name);
      }
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${KSM_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`,
        error
      );
      window.showErrorMessage(
        `${KSM_ERROR_MESSAGES.FAILED_TO_GENERATE_PASSWORD}`
      );
    } finally {
      this.spinner.hide();
    }
  }
}
