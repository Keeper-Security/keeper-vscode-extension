import { ModeType } from '../../../types';
import { logger } from '../../../utils/logger';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';

export class SwitchToCliHandler extends BaseSwitchModeHandler {
  constructor(private storageManager: KsmStorageManager) {
    super();
  }

  async execute(): Promise<void> {
    try {
      // Clear current storage
      this.storageManager.setCurrentStorage(null);
      // Switch to CLI mode
      this.switchMode(ModeType.CLI);
    } catch (error) {
      logger.logError('SwitchToCliHandler failed', error);
    }
  }
}
