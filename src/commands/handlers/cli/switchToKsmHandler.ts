import { window } from 'vscode';
import { ModeType } from '../../../types';
import { logger } from '../../../utils/logger';
import { CliStorageManager } from '../../storage/cliStorageManager';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';
import { CLI_ERROR_MESSAGES } from '../../../utils/cli-messages';

export class SwitchToKsmHandler extends BaseSwitchModeHandler {
  constructor(private storageManager: CliStorageManager) {
    super();
  }

  async execute(): Promise<void> {
    try {
      // Clear current storage
      this.storageManager.setCurrentStorage(null);
      // Switch to KSM mode
      this.switchMode(ModeType.KSM);
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${CLI_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_KSM}`,
        error
      );
      window.showErrorMessage(`${CLI_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_KSM}`);
    }
  }
}
