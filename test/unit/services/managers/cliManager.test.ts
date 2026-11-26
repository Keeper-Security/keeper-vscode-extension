import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtensionContext } from 'vscode';
import { CliManager } from '../../../../src/services/managers/cliManager';
import { configuration } from '../../../../src/services/configurations';
import { CliFlavor, ICliInstall } from '../../../../src/types';
import {
  CLI_SELECTED_ID_KEY,
  CLI_SELECTED_LABEL_KEY,
} from '../../../../src/utils/constants';

jest.mock('../../../../src/utils/logger');
jest.mock('../../../../src/services/configurations', () => ({
  configuration: { get: jest.fn() },
  ConfigurationKey: { CliFlavor: 'cli.flavor', CliPath: 'cli.path' },
}));

const smk: ICliInstall = {
  path: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  flavor: CliFlavor.SMK,
  smkHost: 'localhost',
  version: '18.1.8',
};

function mockSettings(values: Record<string, unknown>): void {
  (configuration.get as jest.Mock).mockImplementation(
    (key: string) => values[key]
  );
}

describe('CliManager', () => {
  describe('getSettings', () => {
    it('defaults to auto detection with no override', () => {
      mockSettings({});
      expect(CliManager.getSettings()).toEqual({
        flavor: 'auto',
        path: undefined,
      });
    });

    it('reads a flavor and trims the override path', () => {
      mockSettings({
        'cli.flavor': 'smk',
        'cli.path': '  /opt/keeper/bin/keeper  ',
      });
      expect(CliManager.getSettings()).toEqual({
        flavor: CliFlavor.SMK,
        path: '/opt/keeper/bin/keeper',
      });
    });

    it('treats an unknown flavor and a blank path as unset', () => {
      mockSettings({ 'cli.flavor': 'something', 'cli.path': '   ' });
      expect(CliManager.getSettings()).toEqual({
        flavor: 'auto',
        path: undefined,
      });
    });
  });

  describe('saved choice', () => {
    it('saves the resolved path and label to globalState, and reads them back', async () => {
      const state = new Map<string, unknown>();
      const context = {
        globalState: {
          get: (key: string) => state.get(key),
          update: async (key: string, value: unknown) => {
            state.set(key, value);
          },
        },
      } as unknown as ExtensionContext;

      expect(CliManager.getSavedChoice(context)).toBeUndefined();
      await CliManager.saveChoice(context, smk);

      expect(state.get(CLI_SELECTED_ID_KEY)).toBe(smk.realPath);
      expect(state.get(CLI_SELECTED_LABEL_KEY)).toBe(
        'Keeper SMK: localhost (18.1.8)'
      );
      expect(CliManager.getSavedChoice(context)).toEqual({
        id: smk.realPath,
        label: 'Keeper SMK: localhost (18.1.8)',
      });
    });
  });

  describe('getEnvironment', () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    const itPosix = process.platform === 'win32' ? it.skip : it;

    itPosix(
      'adds common install dirs a Dock-launched VS Code lacks on PATH',
      () => {
        process.env.PATH = '/usr/bin:/bin';

        const env = CliManager.getEnvironment();

        expect(env.pathDirs).toEqual(
          expect.arrayContaining([
            '/usr/bin',
            '/bin',
            '/usr/local/bin',
            '/opt/homebrew/bin',
            `${os.homedir()}/.local/bin`,
          ])
        );
        expect(new Set(env.pathDirs).size).toBe(env.pathDirs.length);
        expect(env.homeDirs[0]).toBe(os.homedir());
      }
    );

    itPosix('also scans the invoking user home under sudo', () => {
      process.env.SUDO_USER = 'someone-else';

      const { homeDirs } = CliManager.getEnvironment();

      expect(homeDirs).toContain(
        process.platform === 'darwin'
          ? '/Users/someone-else'
          : '/home/someone-else'
      );
    });
  });

  describe('resolution reuse', () => {
    const contextWith = (id?: string): ExtensionContext =>
      ({
        globalState: {
          get: (key: string) => (key === CLI_SELECTED_ID_KEY ? id : undefined),
        },
      }) as unknown as ExtensionContext;

    it('changes the key when the saved pick or settings change', () => {
      mockSettings({});
      const base = CliManager.getResolutionKey(contextWith());
      expect(CliManager.getResolutionKey(contextWith())).toBe(base);
      expect(CliManager.getResolutionKey(contextWith(smk.realPath))).not.toBe(
        base
      );

      mockSettings({ 'cli.flavor': 'smk' });
      expect(CliManager.getResolutionKey(contextWith())).not.toBe(base);
      mockSettings({ 'cli.path': '/opt/keeper/bin/keeper' });
      expect(CliManager.getResolutionKey(contextWith())).not.toBe(base);
    });

    const itPosix = process.platform === 'win32' ? it.skip : it;

    itPosix(
      'is only still available while the executed file exists and runs',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-mgr-'));
        const file = path.join(dir, 'keeper-smk');
        try {
          expect(CliManager.isStillAvailable({ ...smk, path: file })).toBe(
            false
          );

          fs.writeFileSync(file, '#!/bin/sh\n');
          fs.chmodSync(file, 0o644);
          expect(CliManager.isStillAvailable({ ...smk, path: file })).toBe(
            false
          );

          fs.chmodSync(file, 0o755);
          expect(CliManager.isStillAvailable({ ...smk, path: file })).toBe(
            true
          );

          fs.renameSync(file, `${file}.bak`);
          expect(CliManager.isStillAvailable({ ...smk, path: file })).toBe(
            false
          );
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    );

    it('never reuses an OS-resolved command', () => {
      expect(
        CliManager.isStillAvailable({
          ...smk,
          flavor: CliFlavor.COMMANDER,
          path: 'python3 -m keepercommander',
          isCommand: true,
        })
      ).toBe(false);
    });
  });

  describe('updateSwitchContext', () => {
    const { commands } = require('vscode');
    const commander: ICliInstall = {
      path: '/usr/local/bin/keeper',
      realPath: '/usr/local/keepercommandercli/bin/keeper-commander',
      flavor: CliFlavor.COMMANDER,
    };
    const contextWith = (savedId?: string): ExtensionContext =>
      ({
        globalState: {
          get: (key: string) =>
            key === CLI_SELECTED_ID_KEY ? savedId : undefined,
        },
      }) as unknown as ExtensionContext;
    const contextKeys = (): Record<string, unknown> =>
      Object.fromEntries(
        (commands.executeCommand as jest.Mock).mock.calls
          .filter(([name]: [string]) => name === 'setContext')
          .map(([, key, value]: [string, string, unknown]) => [key, value])
      );

    beforeEach(() => {
      mockSettings({});
      jest
        .spyOn(CliManager, 'findCandidates')
        .mockReturnValue([commander, smk]);
    });

    it('shows only "Switch to Keeper SMK" while Commander is active', async () => {
      await CliManager.updateSwitchContext(contextWith(), commander);
      expect(contextKeys()).toEqual({
        'keeper-security.cli.canSwitchToSmk': true,
        'keeper-security.cli.canSwitchToCommander': false,
      });
    });

    it('shows only "Switch to Keeper Commander" while the only SMK host is active', async () => {
      await CliManager.updateSwitchContext(contextWith(), smk);
      expect(contextKeys()).toEqual({
        'keeper-security.cli.canSwitchToSmk': false,
        'keeper-security.cli.canSwitchToCommander': true,
      });
    });

    it('before the first action, predicts the active CLI from the saved pick or the default', async () => {
      await CliManager.updateSwitchContext(contextWith(smk.realPath), null);
      expect(contextKeys()['keeper-security.cli.canSwitchToCommander']).toBe(
        true
      );

      (commands.executeCommand as jest.Mock).mockClear();
      // No saved pick: Commander is the default when both are installed
      await CliManager.updateSwitchContext(contextWith(), null);
      expect(contextKeys()).toEqual({
        'keeper-security.cli.canSwitchToSmk': true,
        'keeper-security.cli.canSwitchToCommander': false,
      });
    });

    it('shows neither when only one CLI is installed', async () => {
      (CliManager.findCandidates as jest.Mock).mockReturnValue([commander]);
      await CliManager.updateSwitchContext(contextWith(), commander);
      expect(contextKeys()).toEqual({
        'keeper-security.cli.canSwitchToSmk': false,
        'keeper-security.cli.canSwitchToCommander': false,
      });
    });
  });
});
