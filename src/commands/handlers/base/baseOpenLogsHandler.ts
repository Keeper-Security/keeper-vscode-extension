import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';

export abstract class BaseOpenLogsHandler extends BaseCommandHandler {
    async showLogs(): Promise<void> {
        await logger.show();
    }
}
