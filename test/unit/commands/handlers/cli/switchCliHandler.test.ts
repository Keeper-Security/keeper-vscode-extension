import { ExtensionContext, window } from 'vscode';
import { SwitchCliHandler } from '../../../../../src/commands/handlers/cli/switchCliHandler';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { CliService } from '../../../../../src/services/cli';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { configuration } from '../../../../../src/services/configurations';
import { CliFlavor, ICliInstall } from '../../../../../src/types';
import {
  CLI_SELECTED_ID_KEY,
  CLI_SELECTED_LABEL_KEY,
  HELPER_MESSAGES,
} from '../../../../../src/utils/constants';

jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/services/configurations', () => ({
  configuration: { get: jest.fn() },
  ConfigurationKey: { CliPath: 'cli.path', CliFlavor: 'cli.flavor' },
}));
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    })),
  },
}));

const commander: ICliInstall = {
  path: '/usr/local/bin/keeper',
  realPath: '/usr/local/keepercommandercli/bin/keeper-commander',
  flavor: CliFlavor.COMMANDER,
  version: '18.1.8',
};
const smk: ICliInstall = {
  path: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  flavor: CliFlavor.SMK,
  smkHost: 'keeper.example.com',
  version: '18.1.8',
};

describe('SwitchCliHandler', () => {
  let context: ExtensionContext;
  let globalState: Map<string, unknown>;
  let cliService: jest.Mocked<CliService>;
  let storageManager: jest.Mocked<CliStorageManager>;
  let handler: SwitchCliHandler;

  beforeEach(() => {
    globalState = new Map();
    context = {
      globalState: {
        get: jest.fn((key: string) => globalState.get(key)),
        update: jest.fn(async (key: string, value: unknown) => {
          globalState.set(key, value);
        }),
      },
    } as unknown as ExtensionContext;
    cliService = {
      detectInstalls: jest.fn().mockResolvedValue([smk, commander]),
      getActiveCliId: jest.fn().mockReturnValue(commander.realPath),
      switchCli: jest.fn(),
    } as unknown as jest.Mocked<CliService>;
    storageManager = {
      setCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;
    const spinner = {
      show: jest.fn(),
      hide: jest.fn(),
    } as unknown as StatusBarSpinner;
    (configuration.get as jest.Mock).mockReturnValue(undefined);
    handler = new SwitchCliHandler(
      context,
      spinner,
      cliService,
      storageManager
    );
  });

  it('lists every install, marks the current one, and shows the path', async () => {
    (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await handler.execute();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items.map((i: any) => [i.label, i.description, i.picked])).toEqual([
      ['Keeper SMK: keeper.example.com (18.1.8)', smk.path, false],
      ['$(check) Keeper Commander (18.1.8)', commander.path, true],
    ]);
    expect(cliService.switchCli).not.toHaveBeenCalled();
  });

  it('saves the pick, stops the shell, clears the folder and gives the login command', async () => {
    (window.showQuickPick as jest.Mock).mockImplementation(
      async (items: any[]) => items[0]
    );

    await handler.execute();

    expect(globalState.get(CLI_SELECTED_ID_KEY)).toBe(smk.realPath);
    expect(globalState.get(CLI_SELECTED_LABEL_KEY)).toBe(
      'Keeper SMK: keeper.example.com (18.1.8)'
    );
    expect(cliService.switchCli).toHaveBeenCalled();
    expect(storageManager.setCurrentStorage).toHaveBeenCalledWith(null);
    const message = (window.showInformationMessage as jest.Mock).mock
      .calls[0][0];
    expect(message).toContain(`"${smk.path} shell"`);
    expect(message).toContain('saved folder was cleared');
  });

  it('keeps the folder when the same CLI is picked again', async () => {
    (window.showQuickPick as jest.Mock).mockImplementation(
      async (items: any[]) => items[1]
    );

    await handler.execute();

    expect(cliService.switchCli).toHaveBeenCalled();
    expect(storageManager.setCurrentStorage).not.toHaveBeenCalled();
  });

  it('warns that keeper-security.cli.path overrides the pick', async () => {
    (configuration.get as jest.Mock).mockReturnValue('/opt/keeper/bin/keeper');
    (window.showQuickPick as jest.Mock).mockImplementation(
      async (items: any[]) => items[0]
    );

    await handler.execute();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('keeper-security.cli.path')
    );
  });

  it('explains how to install when no CLI is found', async () => {
    cliService.detectInstalls.mockResolvedValue([]);

    await handler.execute();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      HELPER_MESSAGES.CLI_NOT_INSTALLED
    );
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });
});
