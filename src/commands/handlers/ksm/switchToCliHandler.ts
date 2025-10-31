import { ExtensionContext, window } from 'vscode';
import { ModeType } from '../../../types';
import { KSM_ERROR_MESSAGES } from '../../../utils/ksm-messages';
import { logger } from '../../../utils/logger';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';

export class SwitchToCliHandler extends BaseSwitchModeHandler {
  constructor(private context: ExtensionContext, private storageManager: KsmStorageManager) {
    super();
  }

  async execute(): Promise<void> {
    try {
      // Clear current storage
      this.storageManager.setCurrentStorage(null);
      // Switch to CLI mode
      this.switchMode(this.context, ModeType.CLI);
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${KSM_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_CLI}`,
        error
      );
      window.showErrorMessage(`${KSM_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_CLI}`);
    }
  }
}
