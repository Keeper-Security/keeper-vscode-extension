import {
  ExtensionContext,
  ProgressLocation,
  QuickPickItem,
  window,
} from 'vscode';
import { ModeType } from '../../../types';
import { KSM_ERROR_MESSAGES } from '../../../utils/ksm-messages';
import { logger } from '../../../utils/logger';
import { KsmStorageManager } from '../../storage/ksmStorageManager';
import { BaseSwitchModeHandler } from '../base/baseSwitchModeHandler';
import { CliManager } from '../../../services/managers/cliManager';
import {
  getCliDisplayLabel,
  getCliInstallId,
} from '../../../services/cliResolver';
import { CLI_INFO_MESSAGES } from '../../../utils/cli-messages';
import { commonQuickPickOptions } from '../../../utils/helper';
import { ICliInstall } from '../../../types';

export class SwitchToCliHandler extends BaseSwitchModeHandler {
  constructor(private context: ExtensionContext, private storageManager: KsmStorageManager) {
    super();
  }

  async execute(): Promise<void> {
    try {
      // Clear current storage
      this.storageManager.setCurrentStorage(null);

      // Several Keeper CLIs installed: ask which one CLI mode should use
      const choice = await this.pickKeeperCli();
      if (choice === undefined) {
        return;
      }

      // Switch to CLI mode
      this.switchMode(
        this.context,
        ModeType.CLI,
        choice
          ? (): Promise<void> => CliManager.saveChoice(this.context, choice)
          : undefined
      );
    } catch (error) {
      logger.logError(
        `${this.constructor.name}: ${KSM_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_CLI}`,
        error
      );
      window.showErrorMessage(`${KSM_ERROR_MESSAGES.FAILED_TO_SWITCH_TO_CLI}`);
    }
  }

  /**
   * Which Keeper CLI to use in CLI mode. Returns `null` when there's nothing to
   * choose (zero or one working install: CLI mode works as before) and
   * `undefined` when cancelled. Installs are only run (`--version`) when more
   * than one is on disk, so a single-CLI machine pays nothing extra.
   */
  private async pickKeeperCli(): Promise<ICliInstall | null | undefined> {
    if (CliManager.findCandidates().length <= 1) {
      return null;
    }

    const { installs: candidates } = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: CLI_INFO_MESSAGES.DETECTING_KEEPER_CLIS,
      },
      () => CliManager.verifyCandidates(CliManager.findCandidates())
    );
    if (candidates.length <= 1) {
      return null;
    }

    const savedId = CliManager.getSavedChoice(this.context)?.id;
    const items: (QuickPickItem & { install: ICliInstall })[] = candidates.map(
      (install) => {
        const isSaved = getCliInstallId(install) === savedId;
        return {
          label: `${isSaved ? '$(check) ' : ''}${getCliDisplayLabel(install)}`,
          description: install.path,
          picked: isSaved,
          install,
        };
      }
    );
    const selected = await window.showQuickPick(items, {
      title: CLI_INFO_MESSAGES.QUICK_PICK_FOR_CLI_MODE_TITLE,
      placeHolder: CLI_INFO_MESSAGES.QUICK_PICK_FOR_CLI_MODE_PLACEHOLDER,
      ...commonQuickPickOptions,
    });
    return selected?.install;
  }
}
