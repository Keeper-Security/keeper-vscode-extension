import { KsmService } from '../../../services/ksm';
import { BaseSaveValueHandler } from '../base/baseSaveValueHandler';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { createKeeperReference, StatusBarSpinner } from '../../../utils/helper';
import { Range, Uri, window } from 'vscode';
import { logger } from '../../../utils/logger';
import {
  KSM_ERROR_MESSAGES,
  KSM_INFO_MESSAGES,
  KSM_LOGGER_DEBUG_MESSAGES,
  KSM_LOGGER_ERROR_MESSAGES,
} from '../../../utils/ksm-messages';
import { CreateOptions } from '@keeper-security/secrets-manager-core';
import {
  KEEPER_NOTATION_FIELD_TYPES,
  KEEPER_RECORD_TYPES,
} from '../../../utils/constants';

export class KsmSaveValueHandler extends BaseSaveValueHandler {
  constructor(
    private spinner: StatusBarSpinner,
    private ksmService: KsmService,
    private storageManager: KsmStorageManager
  ) {
    super();
  }
  async execute(
    secretValue?: string,
    range?: Range,
    documentUri?: Uri
  ): Promise<void> {
    try {
      // extract selected text from the active text editor from selected range or manual selection
      const selectedText = await this.getSelectedText(
        secretValue,
        range,
        documentUri
      );
      if (!selectedText) {
        window.showErrorMessage(KSM_ERROR_MESSAGES.NO_VALUE_FOUND_TO_SAVE);
        return;
      }

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
      const recordFieldName = await this.getSecretFieldNameFromUser();
      if (!recordFieldName) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            KSM_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION
        );
        return;
      }

      if (!(await this.storageManager.ensureValidStorage())) {
        return;
      }

      this.spinner.show(KSM_INFO_MESSAGES.SAVING_SECRET);

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
        custom: [
          {
            type: this.getFieldType(recordFieldName),
            label: recordFieldName,
            value: [selectedText],
          },
        ],
      };
      const newRecordUid = await this.ksmService.executeKsmCommand(() =>
        this.ksmService.createSecret(createOptions, newRec)
      );

      const recordRef = createKeeperReference(
        newRecordUid.trim(),
        KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD,
        recordFieldName
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
        `KsmSaveValueHandler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
      window.showErrorMessage(
        `Failed to save secret: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.spinner.hide();
    }
  }
}
