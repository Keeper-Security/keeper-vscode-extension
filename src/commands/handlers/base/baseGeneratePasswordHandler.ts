import { window } from 'vscode';
import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';
import { commonInputBoxOptions } from '../../../utils/helper';

export abstract class BaseGeneratePasswordHandler extends BaseCommandHandler {
  async getRecordNameFromUser(): Promise<string | undefined> {
    logger.logDebug(
      `Prompting user to enter record name for password generation`
    );

    const recordName = await window.showInputBox({
      prompt: 'What do you want to call this record?',
      placeHolder: "Enter a name for this record. e.g. 'My Password'",
      ...commonInputBoxOptions,
    });

    return recordName;
  }

  showFunctionalitySuccessMessage(currentStorageName?: string): void {
    let message = 'Password generated and saved to keeper vault';
    if (currentStorageName) {
      message += ` at "${currentStorageName}" folder successfully!`;
    }
    window.showInformationMessage(message);
  }
}
