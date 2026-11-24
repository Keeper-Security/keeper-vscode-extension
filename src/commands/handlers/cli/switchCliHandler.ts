import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { BaseCommandHandler } from '../base/baseCommandHandler';
import { CliService } from '../../../services/cli';
import { CliManager } from '../../../services/managers/cliManager';
import {
  getCliDescription,
  getCliDisplayLabel,
  getCliInstallId,
  getCliTerminalCommand,
} from '../../../services/cliResolver';
import { CliStorageManager } from '../../storage/cliStorageManager';
import {
  commonQuickPickOptions,
  getKeeperCliSwitchedMessage,
  StatusBarSpinner,
} from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
} from '../../../utils/cli-messages';
import { HELPER_MESSAGES } from '../../../utils/constants';
import { ICliInstall } from '../../../types';

interface ICliQuickPickItem extends QuickPickItem {
  install: ICliInstall;
}

/**
 * "Keeper Security: Switch Keeper CLI". Lists every detected Keeper Commander and
 * Keeper SMK install, saves the pick, and stops the running shell so the next
 * Keeper action starts with the new CLI.
 */
export class SwitchCliHandler extends BaseCommandHandler {
  constructor(
    private context: ExtensionContext,
    private spinner: StatusBarSpinner,
    private cliService: CliService,
    private storageManager: CliStorageManager
  ) {
    super();
  }

  async execute(): Promise<void> {
    try {
      this.spinner.show(CLI_INFO_MESSAGES.DETECTING_KEEPER_CLIS);
      const installs = await this.cliService.detectInstalls();
      this.spinner.hide();

      if (installs.length === 0) {
        window.showErrorMessage(HELPER_MESSAGES.CLI_NOT_INSTALLED);
        return;
      }

      const currentId =
        this.cliService.getActiveCliId() ??
        CliManager.getSavedChoice(this.context)?.id;

      const selected = await window.showQuickPick(
        installs.map((install) => this.toQuickPickItem(install, currentId)),
        {
          title: CLI_INFO_MESSAGES.QUICK_PICK_FOR_KEEPER_CLI_TITLE,
          placeHolder: CLI_INFO_MESSAGES.QUICK_PICK_FOR_KEEPER_CLI_PLACEHOLDER,
          ...commonQuickPickOptions,
        }
      );
      if (!selected) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_KEEPER_CLI_SELECTION
        );
        return;
      }

      const chosen = selected.install;
      const changed = getCliInstallId(chosen) !== currentId;

      await CliManager.saveChoice(this.context, chosen);
      this.cliService.switchCli();
      if (changed) {
        // Folder UIDs from one vault are meaningless in another
        this.storageManager.setCurrentStorage(null);
      }
      logger.logInfo(
        `${this.constructor.name}: Keeper CLI switched to ${getCliDescription(chosen)}`
      );

      if (CliManager.getSettings().path) {
        window.showWarningMessage(
          CLI_INFO_MESSAGES.KEEPER_CLI_PATH_OVERRIDES_SELECTION
        );
      }

      window.showInformationMessage(
        getKeeperCliSwitchedMessage(
          getCliDisplayLabel(chosen),
          chosen.path,
          changed,
          getCliTerminalCommand(chosen)
        )
      );
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${CLI_ERROR_MESSAGES.FAILED_TO_SWITCH_KEEPER_CLI}`,
        error
      );
      window.showErrorMessage(CLI_ERROR_MESSAGES.FAILED_TO_SWITCH_KEEPER_CLI);
    } finally {
      this.spinner.hide();
    }
  }

  private toQuickPickItem(
    install: ICliInstall,
    currentId: string | undefined | null
  ): ICliQuickPickItem {
    const isCurrent = getCliInstallId(install) === currentId;
    return {
      label: `${isCurrent ? '$(check) ' : ''}${getCliDisplayLabel(install)}`,
      description: install.path,
      detail: isCurrent ? CLI_INFO_MESSAGES.CURRENT_KEEPER_CLI : undefined,
      picked: isCurrent,
      install,
    };
  }
}
