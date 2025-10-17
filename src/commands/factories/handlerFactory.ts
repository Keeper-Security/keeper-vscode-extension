import { ExtensionContext } from 'vscode';
import { CliService } from '../../services/cli';
import { KsmService } from '../../services/ksm';
import { Mode, ModeType } from '../../types';
import { StatusBarSpinner } from '../../utils/helper';
import { StorageManager } from '../storage/storageManager';
import { ICommandHandler } from '../handlers/base/baseCommandHandler';
import { COMMANDS } from '../../utils/constants';
import { ChooseFolderHandler } from '../handlers/chooseFolderHandler';
import { OpenLogsHandler } from '../handlers/openLogsHandler';
import { GeneratePasswordHandler } from '../handlers/generatePasswordHandler';
import { RunSecurelyHandler } from '../handlers/runSecurelyHandler';
import { GetValueHandler } from '../handlers/getValueHandler';
import { SaveValueHandler } from '../handlers/saveValueHandler';
import { KsmGetValueHandler } from '../handlers/ksm/ksmGetValueHandler';
import { SwitchToCliHandler } from '../handlers/ksm/switchToCliHandler';
import { SwitchToKsmHandler } from '../handlers/cli/switchToKsmHandler';
import { KsmSaveValueHandler } from '../handlers/ksm/ksmSaveValueHandler';
import { KsmRunSecurelyHandler } from '../handlers/ksm/ksmRunSecurelyHandler';
import { KsmGeneratePasswordHandler } from '../handlers/ksm/ksmGeneratePasswordHandler';
import { KsmChooseFolderHandler } from '../handlers/ksm/ksmChooseFolderHandler';
import { KsmOpenLogsHandler } from '../handlers/ksm/ksmOpenLogsHandler';
import { KsmAuthenticateHandler } from '../handlers/ksm/ksmAuthenticateHandler';

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
      const storageManager = new StorageManager(
        context,
        service as CliService,
        spinner
      );

      handlers.set(
        COMMANDS.SAVE_VALUE_TO_VAULT,
        new SaveValueHandler(cliService, spinner, storageManager)
      );
      handlers.set(
        COMMANDS.GET_VALUE_FROM_VAULT,
        new GetValueHandler(cliService, spinner)
      );
      handlers.set(
        COMMANDS.GENERATE_PASSWORD,
        new GeneratePasswordHandler(cliService, spinner, storageManager)
      );
      handlers.set(
        COMMANDS.RUN_SECURELY,
        new RunSecurelyHandler(cliService, spinner, context)
      );
      handlers.set(
        COMMANDS.CHOOSE_FOLDER,
        new ChooseFolderHandler(cliService, spinner, storageManager)
      );
      handlers.set(COMMANDS.OPEN_LOGS, new OpenLogsHandler());
      handlers.set(COMMANDS.SWITCH_TO_KSM, new SwitchToKsmHandler());
    } else if (serviceMode === ModeType.KSM) {
      const ksmService = service as KsmService;

      handlers.set(COMMANDS.SAVE_VALUE_TO_VAULT, new KsmSaveValueHandler());
      handlers.set(
        COMMANDS.GET_VALUE_FROM_VAULT,
        new KsmGetValueHandler(ksmService, spinner)
      );
      handlers.set(
        COMMANDS.GENERATE_PASSWORD,
        new KsmGeneratePasswordHandler()
      );
      handlers.set(COMMANDS.RUN_SECURELY, new KsmRunSecurelyHandler(context, ksmService, spinner));
      handlers.set(COMMANDS.CHOOSE_FOLDER, new KsmChooseFolderHandler());
      handlers.set(COMMANDS.OPEN_LOGS, new KsmOpenLogsHandler());
      handlers.set(COMMANDS.SWITCH_TO_CLI, new SwitchToCliHandler());
      handlers.set(COMMANDS.AUTHENTICATE, new KsmAuthenticateHandler(ksmService, spinner));

    }

    return handlers;
  }
}
