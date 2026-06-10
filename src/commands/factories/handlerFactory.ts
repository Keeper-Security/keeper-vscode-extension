import { ExtensionContext } from 'vscode';
import { CliService } from '../../services/cli';
import { KsmService } from '../../services/ksm';
import { Mode, ModeType } from '../../types';
import { StatusBarSpinner } from '../../utils/helper';
import { ICommandHandler } from '../handlers/base/baseCommandHandler';
import { COMMANDS } from '../../utils/constants';
import { KsmGetValueHandler } from '../handlers/ksm/ksmGetValueHandler';
import { SwitchToCliHandler } from '../handlers/ksm/switchToCliHandler';
import { SwitchToKsmHandler } from '../handlers/cli/switchToKsmHandler';
import { KsmSaveValueHandler } from '../handlers/ksm/ksmSaveValueHandler';
import { KsmRunSecurelyHandler } from '../handlers/ksm/ksmRunSecurelyHandler';
import { KsmGeneratePasswordHandler } from '../handlers/ksm/ksmGeneratePasswordHandler';
import { KsmChooseFolderHandler } from '../handlers/ksm/ksmChooseFolderHandler';
import { KsmOpenLogsHandler } from '../handlers/ksm/ksmOpenLogsHandler';
import { KsmAuthenticateHandler } from '../handlers/ksm/ksmAuthenticateHandler';
import { CliRunSecurelyHandler } from '../handlers/cli/cliRunSecurelyHandler';
import { KsmStorageManager } from '../storage/ksmStorageManager';
import { CliChooseFolderHandler } from '../handlers/cli/cliChooseFolderHandler';
import { CliStorageManager } from '../storage/cliStorageManager';
import { CliGetValueHandler } from '../handlers/cli/cliGetValueHandler';
import { CliOpenLogsHandler } from '../handlers/cli/cliOpenLogsHandler';
import { CliGeneratePasswordHandler } from '../handlers/cli/cliGeneratePasswordHandler';
import { CliSaveValueHandler } from '../handlers/cli/cliSaveValueHandler';

export class HandlerFactory {
  static createHandler(
    serviceMode: Mode,
    service: CliService | KsmService,
    context: ExtensionContext,
    spinner: StatusBarSpinner
  ): Map<string, ICommandHandler> {
    const handlers = new Map<string, ICommandHandler>();

    if (serviceMode === ModeType.CLI) {
      const cliService = service as CliService;
      const storageManager = new CliStorageManager(
        context,
        spinner,
        cliService
      );

      handlers.set(
        COMMANDS.SAVE_VALUE_TO_VAULT,
        new CliSaveValueHandler(spinner, cliService, storageManager)
      );
      handlers.set(
        COMMANDS.GET_VALUE_FROM_VAULT,
        new CliGetValueHandler(spinner, cliService, storageManager)
      );
      handlers.set(
        COMMANDS.GENERATE_PASSWORD,
        new CliGeneratePasswordHandler(spinner, cliService, storageManager)
      );
      handlers.set(
        COMMANDS.RUN_SECURELY,
        new CliRunSecurelyHandler(context, spinner, cliService)
      );
      handlers.set(
        COMMANDS.CHOOSE_FOLDER,
        new CliChooseFolderHandler(spinner, cliService, storageManager)
      );
      handlers.set(COMMANDS.OPEN_LOGS, new CliOpenLogsHandler());
      handlers.set(
        COMMANDS.SWITCH_TO_KSM,
        new SwitchToKsmHandler(context, storageManager)
      );
    } else if (serviceMode === ModeType.KSM) {
      const ksmService = service as KsmService;
      const storageManager = new KsmStorageManager(
        context,
        spinner,
        ksmService
      );

      handlers.set(
        COMMANDS.SAVE_VALUE_TO_VAULT,
        new KsmSaveValueHandler(spinner, ksmService, storageManager)
      );
      handlers.set(
        COMMANDS.GET_VALUE_FROM_VAULT,
        new KsmGetValueHandler(spinner, ksmService)
      );
      handlers.set(
        COMMANDS.GENERATE_PASSWORD,
        new KsmGeneratePasswordHandler(spinner, ksmService, storageManager)
      );
      handlers.set(
        COMMANDS.RUN_SECURELY,
        new KsmRunSecurelyHandler(context, spinner, ksmService)
      );
      handlers.set(
        COMMANDS.CHOOSE_FOLDER,
        new KsmChooseFolderHandler(spinner, ksmService, storageManager)
      );
      handlers.set(COMMANDS.OPEN_LOGS, new KsmOpenLogsHandler());
      handlers.set(
        COMMANDS.SWITCH_TO_CLI,
        new SwitchToCliHandler(context, storageManager)
      );
      handlers.set(
        COMMANDS.AUTHENTICATE,
        new KsmAuthenticateHandler(spinner, ksmService, storageManager)
      );
    }

    return handlers;
  }
}
