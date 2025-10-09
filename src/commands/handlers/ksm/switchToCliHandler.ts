import { ModeType } from '../../../types';
import { logger } from '../../../utils/logger';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';

export class SwitchToCliHandler extends BaseSwitchModeHandler {
  constructor() {
    super();
  }

  async execute(): Promise<void> {
    try {
      this.switchMode(ModeType.CLI);
    } catch (error) {
      logger.logError('SwitchToCliHandler.execute failed', error);
    }
  }
}
