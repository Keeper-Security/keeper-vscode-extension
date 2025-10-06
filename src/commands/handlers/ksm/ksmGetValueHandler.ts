import { KsmService } from '../../../services/ksm';
import { BaseGetValueHandler } from '../base/baseGetValueHandler';

export class KsmGetValueHandler extends BaseGetValueHandler {

  constructor(
    private ksmService: KsmService,
  ) {
    super();
  }
  
  async execute(): Promise<void> {
    console.log('KsmGetValueHandler.execute called');

    if (await this.ksmService.isKsmReady()) {
        console.log('KsmGetValueHandler: CLI is ready');

        const secrets = await this.ksmService.executeKsmCommand(() => this.ksmService.getSecrets());
        console.log('KsmGetValueHandler: Secrets', secrets);
        
    }
  }
}
