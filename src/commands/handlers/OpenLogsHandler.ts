import { logger } from "../../utils/logger";
import { ICommandHandler } from "./BaseCommandHandler";

export class OpenLogsHandler implements ICommandHandler {
    async execute(): Promise<void> {
        await logger.show();
    }
} 