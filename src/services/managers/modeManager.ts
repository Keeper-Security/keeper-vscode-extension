import { window } from 'vscode';
import { configuration, ConfigurationKey } from '../configurations';
import { Mode } from '../../types';
import { commonQuickPickOptions } from '../../utils/helper';

export class ModeManager {
  static getCurrentMode(): Mode | undefined {
    return configuration.get(ConfigurationKey.ModeType) as
      | Mode
      | undefined;
  }

  static async setMode(mode: Mode): Promise<void> {
    await configuration.set(ConfigurationKey.ModeType, mode);
  }

  static async promptForModeSelection(): Promise<Mode> {
    const selection = await window.showQuickPick(
      [
        {
          label: '$(terminal) Keeper Commander CLI',
          description: 'Use Keeper Commander CLI (requires CLI installation)',
          value: 'cli',
        },
        {
          label: '$(cloud) Keeper Secrets Manager',
          description: 'Use Keeper Secrets Manager SDK (requires OTA token)',
          value: 'ksm',
        },
      ],
      {
        placeHolder: 'Choose your preferred Mode type',
        ...commonQuickPickOptions
      }
    );

    return (selection?.value as Mode);
  }
}
