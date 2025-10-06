import { logger } from '../../../utils/logger';

export interface ICommandHandler {
  execute(): Promise<void>;
}

export abstract class BaseCommandHandler implements ICommandHandler {
  constructor() {
    logger.logDebug(`Initializing ${this.constructor.name}`);
  }

  abstract execute(): Promise<void>;
}
