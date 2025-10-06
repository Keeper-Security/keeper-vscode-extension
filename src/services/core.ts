import { ExtensionContext } from 'vscode';
import { CommandService } from '../commands';
import { StatusBarSpinner } from '../utils/helper';
import { SecretDetectionService } from './secretDetection';
import { logger } from '../utils/logger';
import { ModeManager } from './managers/modeManager';
import { ServiceManager } from './managers/serviceManager';

export class Core {
  private serviceManager!: ServiceManager;
  private spinner: StatusBarSpinner;

  public constructor(public context: ExtensionContext) {
    logger.logDebug('Initializing Core service');
    this.spinner = new StatusBarSpinner();
    this.initializeServices();

    // Register disposal handler
    this.context.subscriptions.push({
      dispose: () => this.dispose(),
    });
    logger.logDebug('Core service initialization completed');
  }

  private async initializeServices(): Promise<void> {
    logger.logDebug('Starting service initialization');

    let currentMode = ModeManager.getCurrentMode();
    console.log('currentMode', currentMode);

    if (!currentMode) {
      currentMode = await ModeManager.promptForModeSelection();
      await ModeManager.setMode(currentMode);
    }

    // Initialize service manager
    this.serviceManager = new ServiceManager(
      this.context,
      this.spinner,
      currentMode
    );

    // Initialize other services

    new CommandService(this.context, this.serviceManager, this.spinner);

    new SecretDetectionService(this.context);

    logger.logDebug('All services initialized successfully');
  }

  private dispose(): void {
    logger.logDebug('Disposing Core service resources');
    // Clean up resources
    this.serviceManager.getCurrentService().dispose();
    this.spinner.dispose();
    logger.logDebug('Core service disposal completed');
  }
}
