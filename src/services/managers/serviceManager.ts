import { CliService } from '../cli';
import { KsmService } from '../ksm';
import { Mode, ModeType } from '../../types';
import { ExtensionContext } from 'vscode';
import { StatusBarSpinner } from '../../utils/helper';

export class ServiceManager {
  private cliService?: CliService;
  private ksmService?: KsmService;
  private currentMode: Mode;

  constructor(
    private context: ExtensionContext,
    private spinner: StatusBarSpinner,
    mode: Mode
  ) {
    this.currentMode = mode;
    this.initializeServices();
  }

  private initializeServices(): void {
    if (this.currentMode === ModeType.CLI) {
      this.cliService = new CliService(this.context, this.spinner);
    } else if (this.currentMode === ModeType.KSM) {
      this.ksmService = new KsmService(this.context, this.spinner);
    }else {
      throw new Error('Invalid mode');
    }
  }

  getCurrentService(): CliService | KsmService {
    if (this.currentMode === ModeType.CLI && this.cliService) {
      return this.cliService;
    } else if (this.currentMode === ModeType.KSM && this.ksmService) {
      return this.ksmService;
    } else {
      throw new Error('No service found for current mode');
    }
  }

  getCurrentMode(): Mode {
    return this.currentMode;
  }
}
