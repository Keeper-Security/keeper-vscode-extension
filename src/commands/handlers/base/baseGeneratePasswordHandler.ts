import { window } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';
import { commonInputBoxOptions } from '../../../utils/helper';
import { BASE_HANDLER_MESSAGES } from '../../../utils/constants';

export abstract class BaseGeneratePasswordHandler extends BaseCommandHandler {
  async getRecordNameFromUser(): Promise<string | undefined> {
    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.GET_RECORD_NAME_FROM_USER
    );

    const recordName = await window.showInputBox({
      prompt: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PROMPT,
      placeHolder: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PLACEHOLDER,
      ...commonInputBoxOptions,
    });

    return recordName;
  }

  showFunctionalitySuccessMessage(currentStorageName?: string): void {
    let message = BASE_HANDLER_MESSAGES.INFO.PASSWORD_GENERATED_AND_SAVED_TO_KEEPER_VAULT;
    if (currentStorageName) {
      message += ` at "${currentStorageName}" folder successfully!`;
    }
    window.showInformationMessage(message);
  }
}
