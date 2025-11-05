import { BaseOpenLogsHandler } from '../base/baseOpenLogsHandler';

export class KsmOpenLogsHandler extends BaseOpenLogsHandler {
  constructor() {
    super();
  }
  async execute(): Promise<void> {
    await this.showLogs();
  }
}
