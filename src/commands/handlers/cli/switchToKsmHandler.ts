import { ModeType } from '../../../types';
import { logger } from '../../../utils/logger';
import { CliStorageManager } from '../../storage/cliStorageManager';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';

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
      logger.logError('SwitchToKsmHandler failed', error);
    }
  }
}
