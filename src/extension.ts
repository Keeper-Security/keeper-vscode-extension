import pckg from '../package.json';
import { configuration, ConfigurationKey, Core } from './services';
import { logger } from './utils/logger';
import { DEBUG } from './utils/constants';
import { ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext) {
  try {
    // Configure first
    configuration.configure(context);

    logger.logInfo(`Starting Keeper Security for VS Code.`);
    logger.logInfo(`Extension Version: ${pckg.version}.`);

    // Add more detailed diagnostic logging
    const debugSetting = configuration.get<boolean>(ConfigurationKey.DebugEnabled);
    const debugConstant = DEBUG;

    if (debugSetting || debugConstant) {
      logger.setOutputLevel("DEBUG");
      logger.logDebug("Debug logging enabled");
    }

    // Initialize core with all services
    new Core(context);

    logger.logInfo("Keeper Security extension activated successfully");

  } catch (error) {
    logger.logError("Failed to activate extension", error);
    throw error;
  }

}

export function deactivate() {
  logger.logInfo("Keeper Security extension deactivated");
}
