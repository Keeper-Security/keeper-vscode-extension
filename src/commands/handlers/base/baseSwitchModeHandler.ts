import { commands, ExtensionContext, window } from 'vscode';
import { Mode } from '../../../types';
import { RELOAD_WINDOW } from '../../../utils/constants';
import { getSwitchModeMessage } from '../../../utils/helper';
import { BaseCommandHandler } from './baseCommandHandler';
import { ModeManager } from '../../../services/managers/modeManager';

export abstract class BaseSwitchModeHandler extends BaseCommandHandler {
  /**
   * @param beforeReload runs after the user confirms, before the mode is saved and
   *   the window reloads (e.g. saving which Keeper CLI CLI mode should use)
   */
  async switchMode(
    context: ExtensionContext,
    mode: Mode,
    beforeReload?: () => Promise<void>
  ): Promise<void> {
    // Show modal confirmation dialog to reload window
    const action = RELOAD_WINDOW;
    const message = getSwitchModeMessage(mode);

    const userResponse = await window.showInformationMessage(
      message,
      { modal: true },
      action
    );

    if (userResponse === action) {
      await beforeReload?.();
      await ModeManager.setMode(context, mode);
      await commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}
