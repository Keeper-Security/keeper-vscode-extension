import { BaseOpenLogsHandler } from '../base/baseOpenLogsHandler';

export class CliOpenLogsHandler extends BaseOpenLogsHandler {
  constructor() {
    super();
  }
  async execute(): Promise<void> {
    await this.showLogs();
  }
}
