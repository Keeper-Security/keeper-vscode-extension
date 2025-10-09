import { commands, window } from 'vscode';
import { Mode } from '../../../types';
import { RELOAD_WINDOW } from '../../../utils/constants';
import { getSwitchModeMessage } from '../../../utils/helper';
import { BaseCommandHandler } from './baseCommandHandler';
import { ModeManager } from '../../../services/managers/modeManager';

export abstract class BaseSwitchModeHandler extends BaseCommandHandler {
  async switchMode(mode: Mode): Promise<void> {
    // Show modal confirmation dialog to reload window
    const action = RELOAD_WINDOW;
    const message = getSwitchModeMessage(mode);

    const userResponse = await window.showInformationMessage(
      message,
      { modal: true },
      action
    );

    if (userResponse === action) {
      await ModeManager.setMode(mode);
      await commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}
