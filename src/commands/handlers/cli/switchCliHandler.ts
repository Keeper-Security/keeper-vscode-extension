import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { BaseCommandHandler } from '../base/baseCommandHandler';
import { CliService } from '../../../services/cli';
import { CliManager } from '../../../services/managers/cliManager';
import {
  getCliDescription,
  getCliDisplayLabel,
  getCliTerminalCommand,
} from '../../../services/cliResolver';
import { CliStorageManager } from '../../storage/cliStorageManager';
import {
  commonQuickPickOptions,
  getKeeperCliSwitchedMessage,
  getKeeperCliUnusableMessage,
  StatusBarSpinner,
} from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
} from '../../../utils/cli-messages';
import { CliFlavor, ICliInstall } from '../../../types';

interface ICliQuickPickItem extends QuickPickItem {
  install: ICliInstall;
}

/**
 * "Switch to Keeper SMK" / "Switch to Keeper Commander" (CLI mode). Each is shown
 * only when there's another CLI of that flavor to switch to. With several (e.g.
 * SMK hosts) the user picks one. The pick is saved and the running shell stopped,
 * so the next Keeper action starts with the new CLI.
 */
export class SwitchCliHandler extends BaseCommandHandler {
  constructor(
    private context: ExtensionContext,
    private spinner: StatusBarSpinner,
    private cliService: CliService,
    private storageManager: CliStorageManager,
    private targetFlavor: CliFlavor
  ) {
    super();
  }

  async execute(): Promise<void> {
    try {
      const targets = CliManager.getSwitchTargets(
        this.context,
        this.cliService.getActiveCli()
      );
      const candidates =
        this.targetFlavor === CliFlavor.SMK
          ? targets.toSmk
          : targets.toCommander;

      if (candidates.length === 0) {
        window.showErrorMessage(
          this.targetFlavor === CliFlavor.SMK
            ? CLI_ERROR_MESSAGES.NO_KEEPER_SMK_TO_SWITCH_TO
            : CLI_ERROR_MESSAGES.NO_KEEPER_COMMANDER_TO_SWITCH_TO
        );
        return;
      }

      // Only the possible targets are run (`--version`), not every install
      this.spinner.show(CLI_INFO_MESSAGES.DETECTING_KEEPER_CLIS);
      const { installs, rejected } =
        await CliManager.verifyCandidates(candidates);
      this.spinner.hide();

      if (installs.length === 0) {
        window.showErrorMessage(
          getKeeperCliUnusableMessage(
            rejected.map((r) => `${r.path} (${r.reason})`)
          )
        );
        return;
      }

      const chosen = await this.pickInstall(installs);
      if (!chosen) {
        logger.logDebug(
          this.constructor.name +
            ': ' +
            CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_KEEPER_CLI_SELECTION
        );
        return;
      }

      await CliManager.saveChoice(this.context, chosen);
      this.cliService.switchCli();
      // Folder UIDs from one vault are meaningless in another
      this.storageManager.setCurrentStorage(null);
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
          true,
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

  // A single target is used directly; several (SMK hosts) are picked from a list
  private async pickInstall(
    installs: ICliInstall[]
  ): Promise<ICliInstall | undefined> {
    if (installs.length === 1) {
      return installs[0];
    }
    const items: ICliQuickPickItem[] = installs.map((install) => ({
      label: getCliDisplayLabel(install),
      description: install.path,
      install,
    }));
    const selected = await window.showQuickPick(items, {
      title:
        this.targetFlavor === CliFlavor.SMK
          ? CLI_INFO_MESSAGES.QUICK_PICK_FOR_KEEPER_SMK_TITLE
          : CLI_INFO_MESSAGES.QUICK_PICK_FOR_KEEPER_COMMANDER_TITLE,
      placeHolder: CLI_INFO_MESSAGES.QUICK_PICK_FOR_KEEPER_CLI_PLACEHOLDER,
      ...commonQuickPickOptions,
    });
    return selected?.install;
  }
}
