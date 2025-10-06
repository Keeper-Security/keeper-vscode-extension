/* eslint-disable @typescript-eslint/no-explicit-any */
import { commands, ExtensionContext } from 'vscode';
import { StatusBarSpinner } from '../utils/helper';
import { logger } from '../utils/logger';
import { ICommandHandler } from './handlers/base/baseCommandHandler';
import { ServiceManager } from '../services/managers/serviceManager';
import { HandlerFactory } from './factories/handlerFactory';

export class CommandService {
  private handlers!: Map<string, ICommandHandler>;

  constructor(
    private context: ExtensionContext,
    private serviceManager: ServiceManager,
    private spinner: StatusBarSpinner
  ) {
    this.initializeHandlers();
    this.registerCommands();
  }

  private initializeHandlers(): void {
    this.handlers = HandlerFactory.createHandler(
      this.serviceManager.getCurrentMode(),
      this.serviceManager.getCurrentService(),
      this.context,
      this.spinner
    );
  }

  private registerCommands(): void {
    logger.logDebug('Registering Keeper Security VSCode commands');
    this.handlers.forEach((handler, command) => {
      logger.logDebug(`Registering command: ${command}`);
      this.context.subscriptions.push(
        commands.registerCommand(command, (...args: any[]) =>
          (handler as any).execute(...args)
        )
      );
    });
    logger.logDebug('All commands registered successfully');
  }
}
