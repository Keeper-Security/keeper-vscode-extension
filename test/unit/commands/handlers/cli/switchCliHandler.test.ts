import { ExtensionContext, window } from 'vscode';
import { SwitchCliHandler } from '../../../../../src/commands/handlers/cli/switchCliHandler';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { CliService } from '../../../../../src/services/cli';
import { CliManager } from '../../../../../src/services/managers/cliManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { CLI_ERROR_MESSAGES } from '../../../../../src/utils/cli-messages';
import { CliFlavor, ICliInstall } from '../../../../../src/types';

jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/services/managers/cliManager', () => ({
  CliManager: {
    getSwitchTargets: jest.fn(),
    verifyCandidates: jest.fn(),
    saveChoice: jest.fn(),
    getSettings: jest.fn(),
  },
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
  version: '18.1.9',
};
const smkExample: ICliInstall = {
  path: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  flavor: CliFlavor.SMK,
  smkHost: 'keeper.example.com',
  version: '18.1.8',
};
const smkLocalhost: ICliInstall = {
  ...smkExample,
  path: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  smkHost: 'localhost',
};

describe('SwitchCliHandler', () => {
  let context: ExtensionContext;
  let cliService: jest.Mocked<CliService>;
  let storageManager: jest.Mocked<CliStorageManager>;
  let spinner: StatusBarSpinner;

  const handler = (flavor: CliFlavor): SwitchCliHandler =>
    new SwitchCliHandler(context, spinner, cliService, storageManager, flavor);

  function withTargets(
    toSmk: ICliInstall[],
    toCommander: ICliInstall[],
    working: ICliInstall[] = [...toSmk, ...toCommander]
  ): void {
    (CliManager.getSwitchTargets as jest.Mock).mockReturnValue({
      toSmk,
      toCommander,
    });
    (CliManager.verifyCandidates as jest.Mock).mockImplementation(
      async (candidates: ICliInstall[]) => ({
        installs: candidates.filter((c) => working.includes(c)),
        rejected: candidates
          .filter((c) => !working.includes(c))
          .map((c) => ({ path: c.path, reason: "'--version' exited with 1" })),
      })
    );
  }

  beforeEach(() => {
    context = {} as ExtensionContext;
    cliService = {
      getActiveCli: jest.fn().mockReturnValue(commander),
      switchCli: jest.fn(),
    } as unknown as jest.Mocked<CliService>;
    storageManager = {
      setCurrentStorage: jest.fn(),
    } as unknown as jest.Mocked<CliStorageManager>;
    spinner = {
      show: jest.fn(),
      hide: jest.fn(),
    } as unknown as StatusBarSpinner;
    (CliManager.saveChoice as jest.Mock).mockResolvedValue(undefined);
    (CliManager.getSettings as jest.Mock).mockReturnValue({ flavor: 'auto' });
  });

  it('switches straight to the only SMK host, without a picker', async () => {
    withTargets([smkExample], []);

    await handler(CliFlavor.SMK).execute();

    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(CliManager.saveChoice).toHaveBeenCalledWith(context, smkExample);
    expect(cliService.switchCli).toHaveBeenCalled();
    expect(storageManager.setCurrentStorage).toHaveBeenCalledWith(null);
    const message = (window.showInformationMessage as jest.Mock).mock
      .calls[0][0];
    expect(message).toContain(
      'Now using Keeper SMK: keeper.example.com (18.1.8)'
    );
    expect(message).toContain(`"${smkExample.path} shell"`);
  });

  it('asks which host when several SMK hosts exist', async () => {
    withTargets([smkExample, smkLocalhost], []);
    (window.showQuickPick as jest.Mock).mockImplementation(
      async (items: any[]) => items[1]
    );

    await handler(CliFlavor.SMK).execute();

    const items = (window.showQuickPick as jest.Mock).mock.calls[0][0];
    expect(items.map((i: any) => [i.label, i.description])).toEqual([
      ['Keeper SMK: keeper.example.com (18.1.8)', smkExample.path],
      ['Keeper SMK: localhost (18.1.8)', smkLocalhost.path],
    ]);
    expect(CliManager.saveChoice).toHaveBeenCalledWith(context, smkLocalhost);
  });

  it('only runs the CLIs it can switch to', async () => {
    withTargets([smkExample], [commander]);

    await handler(CliFlavor.SMK).execute();

    expect(CliManager.verifyCandidates).toHaveBeenCalledWith([smkExample]);
  });

  it('switches back to Commander from SMK', async () => {
    cliService.getActiveCli.mockReturnValue(smkExample);
    withTargets([], [commander]);

    await handler(CliFlavor.COMMANDER).execute();

    expect(CliManager.saveChoice).toHaveBeenCalledWith(context, commander);
    const message = (window.showInformationMessage as jest.Mock).mock
      .calls[0][0];
    expect(message).toContain('"keeper shell"');
  });

  it('changes nothing when the host picker is cancelled', async () => {
    withTargets([smkExample, smkLocalhost], []);
    (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await handler(CliFlavor.SMK).execute();

    expect(CliManager.saveChoice).not.toHaveBeenCalled();
    expect(cliService.switchCli).not.toHaveBeenCalled();
    expect(storageManager.setCurrentStorage).not.toHaveBeenCalled();
  });

  it.each([
    [CliFlavor.SMK, CLI_ERROR_MESSAGES.NO_KEEPER_SMK_TO_SWITCH_TO],
    [CliFlavor.COMMANDER, CLI_ERROR_MESSAGES.NO_KEEPER_COMMANDER_TO_SWITCH_TO],
  ])('explains when there is no %s to switch to', async (flavor, message) => {
    withTargets([], []);

    await handler(flavor).execute();

    expect(window.showErrorMessage).toHaveBeenCalledWith(message);
    expect(CliManager.verifyCandidates).not.toHaveBeenCalled();
    expect(cliService.switchCli).not.toHaveBeenCalled();
  });

  it('says why when the target exists but does not work, and keeps the current CLI', async () => {
    withTargets([smkExample], [], []);

    await handler(CliFlavor.SMK).execute();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining(`${smkExample.path} ('--version' exited with 1)`)
    );
    expect(CliManager.saveChoice).not.toHaveBeenCalled();
    expect(cliService.switchCli).not.toHaveBeenCalled();
  });

  it('warns that keeper-security.cli.path overrides the pick', async () => {
    withTargets([smkExample], []);
    (CliManager.getSettings as jest.Mock).mockReturnValue({
      flavor: 'auto',
      path: '/opt/keeper/bin/keeper',
    });

    await handler(CliFlavor.SMK).execute();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('keeper-security.cli.path')
    );
  });
});
