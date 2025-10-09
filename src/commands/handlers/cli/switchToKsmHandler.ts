import { ModeType } from '../../../types';
import { logger } from '../../../utils/logger';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';

export class SwitchToKsmHandler extends BaseSwitchModeHandler {
  constructor() {
    super();
  }

  async execute(): Promise<void> {
    try {
      this.switchMode(ModeType.KSM);
    } catch (error) {
      logger.logError('SwitchToCliHandler failed', error);
    }
  }
}
