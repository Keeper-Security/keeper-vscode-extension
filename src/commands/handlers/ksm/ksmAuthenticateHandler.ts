import { window } from 'vscode';
import { KsmService } from '../../../services/ksm';
import { BaseCommandHandler } from '../base/baseCommandHandler';
import { logger } from '../../../utils/logger';
import { StatusBarSpinner } from '../../../utils/helper';

export class KsmAuthenticateHandler extends BaseCommandHandler {
  constructor(
    private ksmService: KsmService,
    private spinner: StatusBarSpinner
  ) {
    super();
  }

  async execute(): Promise<void> {
    this.spinner.show('Authenticating with Keeper Secrets Manager...');
    try {
      const storeConfigPath = await this.ksmService.getStoreConfigPath();
      if (!storeConfigPath) {
        return;
      }

      await this.ksmService.handleReAuthentication(storeConfigPath);
    } catch (error) {
      logger.logError('KsmAuthenticateHandler.execute failed', error);
      window.showErrorMessage(
        'Failed to authenticate with Keeper Secrets Manager'
      );
      return;
    } finally {
      this.spinner.hide();
    }
  }
}
