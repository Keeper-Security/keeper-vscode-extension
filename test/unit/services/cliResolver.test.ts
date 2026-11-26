import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildSpawnSpec,
  CliDetector,
  getCliDescription,
  getCliDisplayLabel,
  getCliInstallId,
  getCliSwitchTargets,
  getCliTerminalCommand,
  parseCliVersion,
  resolveCli,
  selectCli,
} from '../../../src/services/cliResolver';
import { CliManager } from '../../../src/services/managers/cliManager';
import {
  CliFlavor,
  CliVersionProbe,
  ICliEnvironment,
  ICliInstall,
} from '../../../src/types';

jest.mock('../../../src/utils/logger');

const probeVersion = CliManager.probeVersion;

// Fake CLIs are POSIX shell scripts
const describePosix = process.platform === 'win32' ? describe.skip : describe;

const BANNER = 'Keeper Commander, version 18.1.8';

describePosix('CliDetector (fake CLIs in temp dirs)', () => {
  let root: string;
  let home: string;
  let pathDir: string;

  beforeEach(() => {
    // Real child processes need real timers (jest.setup enables fake ones)
    jest.useRealTimers();
    // realpath: on macOS the temp dir is behind the /var -> /private/var symlink
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-cli-'))
    );
    home = path.join(root, 'home');
    pathDir = path.join(root, 'bin');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(pathDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeScript(
    file: string,
    body = `echo "${BANNER}"`,
    mode = 0o755
  ): string {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(file, mode);
    return file;
  }

  function smkWrapper(host: string, homeDir = home): string {
    return writeScript(
      path.join(homeDir, '.keeper-smk', host, 'bin', 'keeper-smk')
    );
  }

  function smkVenvKeeper(host: string): string {
    return writeScript(
      path.join(home, '.keeper-smk', host, 'venv', 'bin', 'keeper')
    );
  }

  function env(overrides: Partial<ICliEnvironment> = {}): ICliEnvironment {
    return {
      isWindows: false,
      homeDirs: [home],
      pathDirs: [pathDir],
      knownCommanderPaths: [],
      fallbackCommands: [],
      ...overrides,
    };
  }

  const detect = async (
    e: ICliEnvironment = env(),
    probe: CliVersionProbe = probeVersion
  ): Promise<ICliInstall[]> =>
    (await new CliDetector(e, probe).detectAll()).installs;

  it('finds only Commander', async () => {
    const keeper = writeScript(path.join(pathDir, 'keeper'));

    const installs = await detect();

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      flavor: CliFlavor.COMMANDER,
      path: keeper,
      version: '18.1.8',
    });
    expect(installs[0].smkHost).toBeUndefined();
    expect(getCliTerminalCommand(installs[0])).toBe('keeper');
  });

  it('finds SMK that is not on PATH', async () => {
    const wrapper = smkWrapper('keeper.metrondemo.com');

    const installs = await detect();

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      flavor: CliFlavor.SMK,
      smkHost: 'keeper.metrondemo.com',
      path: wrapper,
    });
    expect(getCliDisplayLabel(installs[0])).toBe(
      'Keeper SMK: keeper.metrondemo.com (18.1.8)'
    );
    // Not on PATH, so login hints use the full wrapper path
    expect(getCliTerminalCommand(installs[0])).toBe(wrapper);
  });

  it('finds both Commander and SMK, SMK first', async () => {
    const wrapper = smkWrapper('keeper.example.com');
    const keeper = writeScript(path.join(pathDir, 'keeper'));

    const installs = await detect();

    expect(installs.map((i) => [i.flavor, i.path])).toEqual([
      [CliFlavor.SMK, wrapper],
      [CliFlavor.COMMANDER, keeper],
    ]);
  });

  it('treats a keeper symlink to an SMK wrapper as that SMK host, listed once', async () => {
    const wrapper = smkWrapper('keeper.example.com');
    fs.symlinkSync(wrapper, path.join(pathDir, 'keeper'));

    const installs = await detect();

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      flavor: CliFlavor.SMK,
      smkHost: 'keeper.example.com',
      path: wrapper,
    });
  });

  it('runs a keeper symlink to an SMK venv binary through the host wrapper', async () => {
    const venvKeeper = smkVenvKeeper('keeper.example.com');
    const wrapper = smkWrapper('keeper.example.com');
    fs.symlinkSync(venvKeeper, path.join(pathDir, 'keeper'));

    const installs = await detect(env({ homeDirs: [] }));

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      flavor: CliFlavor.SMK,
      smkHost: 'keeper.example.com',
      path: wrapper,
    });
  });

  it('skips an SMK venv binary whose host has no wrapper', async () => {
    const venvKeeper = smkVenvKeeper('keeper.example.com');
    fs.symlinkSync(venvKeeper, path.join(pathDir, 'keeper'));
    const log = jest.fn();

    const { installs } = await new CliDetector(
      env(),
      probeVersion,
      log
    ).detectAll();

    expect(installs).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining("SMK host 'keeper.example.com'")
    );
  });

  it('finds several hosts, including localhost and host:port, sorted', async () => {
    smkWrapper('localhost');
    smkWrapper('keeper.example.com');
    smkWrapper('10.0.0.5:8443');

    const installs = await detect();

    expect(installs.map((i) => i.smkHost)).toEqual([
      '10.0.0.5:8443',
      'keeper.example.com',
      'localhost',
    ]);
    expect(installs.every((i) => i.flavor === CliFlavor.SMK)).toBe(true);
  });

  it('classifies keeper-smk outside ~/.keeper-smk as SMK with unknown host', async () => {
    const smk = writeScript(path.join(pathDir, 'keeper-smk'));

    const installs = await detect();

    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({ flavor: CliFlavor.SMK, path: smk });
    expect(installs[0].smkHost).toBeUndefined();
  });

  it('ignores a binary that exits non-zero or prints other text', async () => {
    writeScript(path.join(pathDir, 'keeper'), `echo "${BANNER}"; exit 1`);
    writeScript(
      path.join(home, '.keeper-smk', 'other', 'bin', 'keeper-smk'),
      'echo "some other tool 1.0"'
    );

    expect(await detect()).toEqual([]);
  });

  it('fails fast on a CLI that waits for input, and reports why', async () => {
    const stale = writeScript(
      path.join(pathDir, 'keeper'),
      'printf "Press <Enter> to close Keeper Commander"; read x; exit 1'
    );
    const started = Date.now();

    const { installs, rejected } = await new CliDetector(
      env(),
      probeVersion
    ).detectAll();

    expect(installs).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(rejected).toEqual([
      { path: stale, reason: expect.stringContaining('exited with 1') },
    ]);
  });

  it('reports a candidate whose output is not Keeper Commander', async () => {
    const other = writeScript(
      path.join(pathDir, 'keeper'),
      'echo "keeper 2.0 (some other tool)"'
    );
    const { rejected } = await new CliDetector(env(), probeVersion).detectAll();

    expect(rejected).toEqual([
      { path: other, reason: "'--version' output isn't Keeper Commander" },
    ]);
  });

  it('marks a pip console-script Commander as pip, and the native binary as not', async () => {
    // pip writes a Python-shebang script; the fake "native" one is a plain sh script
    const pipKeeper = path.join(root, 'pybin', 'keeper');
    fs.mkdirSync(path.dirname(pipKeeper), { recursive: true });
    fs.writeFileSync(
      pipKeeper,
      `#!/usr/bin/env python3\nimport sys; print("${BANNER}")\n`
    );
    fs.chmodSync(pipKeeper, 0o755);
    const native = writeScript(path.join(pathDir, 'keeper'));
    const probe: CliVersionProbe = async () => ({ ok: true, output: BANNER });

    const installs = await detect(
      env({ knownCommanderPaths: [pipKeeper] }),
      probe
    );

    expect(installs.map((i) => [i.path, i.isPip])).toEqual([
      [native, false],
      [pipKeeper, true],
    ]);
  });

  it('ignores a non-executable file', async () => {
    writeScript(path.join(pathDir, 'keeper'), `echo "${BANNER}"`, 0o644);

    expect(await detect()).toEqual([]);
  });

  it('returns nothing when nothing is installed', async () => {
    expect(await detect()).toEqual([]);
  });

  it('scans an additional home dir (sudo invoking user)', async () => {
    const otherHome = path.join(root, 'other-home');
    const wrapper = smkWrapper('keeper.example.com', otherHome);

    const installs = await detect(env({ homeDirs: [home, otherHome] }));

    expect(installs.map((i) => i.path)).toEqual([wrapper]);
  });

  it('dedupes the same Commander found on PATH and in known locations', async () => {
    const real = writeScript(
      path.join(root, 'keepercommandercli', 'bin', 'keeper-commander')
    );
    fs.symlinkSync(real, path.join(pathDir, 'keeper'));

    const installs = await detect(env({ knownCommanderPaths: [real] }));

    expect(installs).toHaveLength(1);
    expect(installs[0].path).toBe(path.join(pathDir, 'keeper'));
    expect(installs[0].realPath).toBe(real);
  });

  it('uses fallback commands only when no Commander executable exists', async () => {
    const probe = jest.fn<
      ReturnType<CliVersionProbe>,
      Parameters<CliVersionProbe>
    >(async (spec) =>
      spec.file === 'python3'
        ? { ok: true, output: BANNER }
        : probeVersion(spec)
    );

    const withoutCommander = await detect(
      env({ fallbackCommands: ['python3 -m keepercommander'] }),
      probe
    );
    expect(withoutCommander).toEqual([
      expect.objectContaining({
        flavor: CliFlavor.COMMANDER,
        isCommand: true,
        path: 'python3 -m keepercommander',
      }),
    ]);
    expect(probe).toHaveBeenCalledWith({
      file: 'python3',
      args: ['-m', 'keepercommander', '--version'],
    });

    probe.mockClear();
    writeScript(path.join(pathDir, 'keeper'));
    const withCommander = await detect(
      env({ fallbackCommands: ['python3 -m keepercommander'] }),
      probe
    );
    expect(withCommander.map((i) => i.isCommand ?? false)).toEqual([false]);
    expect(probe).not.toHaveBeenCalledWith(
      expect.objectContaining({ file: 'python3' })
    );
  });

  it('lists installs on disk without running them (findCandidates)', async () => {
    const wrapper = smkWrapper('keeper.example.com');
    const keeper = writeScript(path.join(pathDir, 'keeper'));
    const probe = jest.fn();

    const candidates = new CliDetector(env(), probe).findCandidates();

    expect(probe).not.toHaveBeenCalled();
    expect(candidates.map((c) => [c.flavor, c.path])).toEqual([
      [CliFlavor.SMK, wrapper],
      [CliFlavor.COMMANDER, keeper],
    ]);
  });

  it('verifies only the given candidates', async () => {
    smkWrapper('keeper.example.com');
    const broken = writeScript(path.join(pathDir, 'keeper'), 'exit 1');
    const detector = new CliDetector(env(), probeVersion);
    const [smk, commanderCandidate] = detector.findCandidates();

    expect(
      (await detector.verifyCandidates([smk])).installs.map((i) => i.smkHost)
    ).toEqual(['keeper.example.com']);
    expect(await detector.verifyCandidates([commanderCandidate])).toEqual({
      installs: [],
      rejected: [{ path: broken, reason: "'--version' exited with 1" }],
    });
  });

  describe('inspect (cli.path override)', () => {
    it('runs an override that points into an SMK venv through the wrapper', async () => {
      const venvKeeper = smkVenvKeeper('localhost');
      const wrapper = smkWrapper('localhost');

      const { installs } = await new CliDetector(env(), probeVersion).inspect(
        venvKeeper
      );

      expect(installs[0]).toMatchObject({
        flavor: CliFlavor.SMK,
        smkHost: 'localhost',
        path: wrapper,
      });
    });

    it('returns null for a missing or broken override', async () => {
      const detector = new CliDetector(env(), probeVersion);
      expect(await detector.inspect(path.join(root, 'missing'))).toEqual({
        installs: [],
        rejected: [
          {
            path: path.join(root, 'missing'),
            reason: 'not an executable file',
          },
        ],
      });
      const broken = writeScript(path.join(root, 'broken'), 'exit 2');
      expect((await detector.inspect(broken)).installs).toEqual([]);
    });
  });
});

const commander: ICliInstall = {
  path: '/usr/local/bin/keeper',
  realPath: '/usr/local/keepercommandercli/bin/keeper-commander',
  flavor: CliFlavor.COMMANDER,
  version: '18.1.8',
};
const smkExample: ICliInstall = {
  path: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/keeper.example.com/bin/keeper-smk',
  flavor: CliFlavor.SMK,
  smkHost: 'keeper.example.com',
  version: '18.1.8',
};
const smkLocalhost: ICliInstall = {
  path: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  realPath: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
  flavor: CliFlavor.SMK,
  smkHost: 'localhost',
  version: '18.1.8',
};

const saved = (install: ICliInstall) => ({
  id: getCliInstallId(install),
  label: 'saved',
});

describe('selectCli', () => {
  it('uses a saved choice that still exists', () => {
    const result = selectCli([smkExample, commander], saved(commander), 'auto');
    expect(result).toEqual({
      kind: 'active',
      install: commander,
      source: 'saved',
      autoPickedFromMany: false,
    });
  });

  it('reports a missing saved choice with what was found, and never falls back', () => {
    const missing = {
      id: '/home/u/.keeper-smk/gone.example.com/bin/keeper-smk',
      label: 'Keeper SMK: gone.example.com',
    };

    const result = selectCli([smkExample, commander], missing, 'auto');

    expect(result).toEqual({
      kind: 'savedMissing',
      saved: missing,
      available: [smkExample, commander],
    });
    expect(result.kind).not.toBe('active');
  });

  it('reports a missing saved choice even when exactly one other CLI exists', () => {
    const result = selectCli([commander], saved(smkExample), 'auto');
    expect(result.kind).toBe('savedMissing');
  });

  it('reports a missing saved choice when nothing is installed', () => {
    const result = selectCli([], saved(smkExample), 'auto');
    expect(result).toEqual({
      kind: 'savedMissing',
      saved: saved(smkExample),
      available: [],
    });
  });

  it('uses the only install when nothing is saved', () => {
    expect(selectCli([commander], undefined, 'auto')).toEqual({
      kind: 'active',
      install: commander,
      source: 'single',
      autoPickedFromMany: false,
    });
  });

  it('defaults to Commander over SMK when several exist and nothing is saved', () => {
    // SMK is listed first by detection; Commander still wins
    const result = selectCli(
      [smkLocalhost, smkExample, commander],
      undefined,
      'auto'
    );
    expect(result).toEqual({
      kind: 'active',
      install: commander,
      source: 'auto',
      autoPickedFromMany: true,
    });
  });

  it('defaults to a pip-installed Commander over the native installer', () => {
    const pip: ICliInstall = {
      path: '/Users/u/Library/Python/3.11/bin/keeper',
      realPath: '/Users/u/Library/Python/3.11/bin/keeper',
      flavor: CliFlavor.COMMANDER,
      isPip: true,
    };
    const result = selectCli([smkExample, commander, pip], undefined, 'auto');
    expect(result).toMatchObject({
      kind: 'active',
      install: pip,
      autoPickedFromMany: true,
    });
  });

  it('uses SMK, first host alphabetically, only when no Commander is installed', () => {
    const result = selectCli([smkLocalhost, smkExample], undefined, 'auto');
    expect(result).toEqual({
      kind: 'active',
      install: smkExample,
      source: 'auto',
      autoPickedFromMany: true,
    });
  });

  it('still honors an explicit SMK choice over the Commander default', () => {
    const result = selectCli(
      [commander, smkExample],
      saved(smkExample),
      'auto'
    );
    expect(result).toMatchObject({
      kind: 'active',
      install: smkExample,
      source: 'saved',
    });
  });

  it('picks the first install when several Commanders exist and no SMK', () => {
    const other = {
      ...commander,
      path: '/opt/keeper/bin/keeper',
      realPath: '/opt/keeper/bin/keeper',
    };
    const result = selectCli([commander, other], undefined, 'auto');
    expect(result).toMatchObject({
      kind: 'active',
      install: commander,
      autoPickedFromMany: true,
    });
  });

  it('returns noneFound when nothing is installed and nothing is saved', () => {
    expect(selectCli([], undefined, 'auto')).toEqual({
      kind: 'noneFound',
      rejected: [],
    });
  });

  it('filters by the flavor setting', () => {
    expect(
      selectCli([smkExample, commander], undefined, CliFlavor.COMMANDER)
    ).toMatchObject({
      kind: 'active',
      install: commander,
      source: 'single',
    });
    expect(selectCli([commander], undefined, CliFlavor.SMK)).toEqual({
      kind: 'noneFound',
      rejected: [],
    });
  });

  it('ignores a saved choice of the other flavor when the flavor setting excludes it', () => {
    const result = selectCli(
      [smkExample, commander],
      saved(commander),
      CliFlavor.SMK
    );
    expect(result).toMatchObject({
      kind: 'active',
      install: smkExample,
      source: 'single',
    });
  });
});

describe('resolveCli', () => {
  const env: ICliEnvironment = {
    isWindows: false,
    homeDirs: [],
    pathDirs: [],
    knownCommanderPaths: [],
    fallbackCommands: [],
  };
  const probe: CliVersionProbe = async () => ({
    ok: false,
    reason: 'not found',
  });
  const detector = (
    overrides: Partial<ICliEnvironment> = {},
    p: CliVersionProbe = probe
  ) => new CliDetector({ ...env, ...overrides }, p);

  it('reports an invalid cli.path override instead of falling back to detection', async () => {
    const result = await resolveCli(
      detector(),
      { flavor: 'auto', path: '/does/not/exist/keeper' },
      saved(commander)
    );
    expect(result).toEqual({
      kind: 'overrideInvalid',
      path: '/does/not/exist/keeper',
      rejected: [
        { path: '/does/not/exist/keeper', reason: 'not an executable file' },
      ],
    });
  });

  it('returns noneFound when detection finds nothing', async () => {
    expect(await resolveCli(detector(), { flavor: 'auto' })).toEqual({
      kind: 'noneFound',
      rejected: [],
    });
  });

  it('says which files were found but unusable when nothing works', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-sel-'));
    const keeper = path.join(dir, 'keeper');
    fs.writeFileSync(keeper, '#!/bin/sh\n');
    fs.chmodSync(keeper, 0o755);
    try {
      const result = await resolveCli(
        detector({ pathDirs: [dir] }, async () => ({
          ok: false,
          reason: "'--version' did not finish within 60s",
        })),
        { flavor: 'auto' }
      );
      expect(result).toEqual({
        kind: 'noneFound',
        rejected: [
          { path: keeper, reason: "'--version' did not finish within 60s" },
        ],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns savedMissing through the full pipeline', async () => {
    const result = await resolveCli(
      detector(),
      { flavor: 'auto' },
      saved(smkExample)
    );
    expect(result.kind).toBe('savedMissing');
  });
});

describe('CLI install helpers', () => {
  it('builds argv without a shell, using cmd /c only for Windows shims and commands', () => {
    expect(
      buildSpawnSpec({ path: '/usr/local/bin/keeper' }, ['shell'], false)
    ).toEqual({
      file: '/usr/local/bin/keeper',
      args: ['shell'],
    });
    expect(
      buildSpawnSpec(
        { path: 'python3 -m keepercommander', isCommand: true },
        ['--version'],
        false
      )
    ).toEqual({
      file: 'python3',
      args: ['-m', 'keepercommander', '--version'],
    });
    expect(
      buildSpawnSpec({ path: 'C:\\Keeper\\keeper.cmd' }, ['shell'], true)
    ).toEqual({
      file: 'cmd',
      args: ['/c', 'C:\\Keeper\\keeper.cmd', 'shell'],
    });
    expect(
      buildSpawnSpec({ path: 'C:\\Keeper\\keeper.exe' }, ['shell'], true)
    ).toEqual({
      file: 'C:\\Keeper\\keeper.exe',
      args: ['shell'],
    });
  });

  it('labels installs and gives the real login command', () => {
    expect(getCliDisplayLabel(smkExample)).toBe(
      'Keeper SMK: keeper.example.com (18.1.8)'
    );
    expect(getCliDescription(commander)).toBe(
      'Keeper Commander (18.1.8) at /usr/local/bin/keeper'
    );
    expect(getCliTerminalCommand(commander)).toBe('keeper');
    expect(getCliTerminalCommand(smkExample)).toBe(smkExample.path);
    expect(
      getCliTerminalCommand({
        ...smkExample,
        path: '/home/my user/bin/keeper-smk',
      })
    ).toBe('"/home/my user/bin/keeper-smk"');
  });

  it('identifies installs by resolved path, and commands by their text', () => {
    expect(getCliInstallId(commander)).toBe(commander.realPath);
    expect(
      getCliInstallId({
        ...commander,
        path: 'python3 -m keepercommander',
        isCommand: true,
      })
    ).toBe('command:python3 -m keepercommander');
  });

  it('parses the Commander version banner', () => {
    expect(parseCliVersion('Keeper Commander, version 18.1.8\n')).toBe(
      '18.1.8'
    );
    expect(parseCliVersion('something else')).toBeUndefined();
  });
});

describe('getCliSwitchTargets (which switch commands show)', () => {
  const localhost: ICliInstall = {
    ...smkExample,
    path: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
    realPath: '/home/u/.keeper-smk/localhost/bin/keeper-smk',
    smkHost: 'localhost',
  };

  it('on Commander: offers SMK, not Commander', () => {
    expect(getCliSwitchTargets([commander, smkExample], commander)).toEqual({
      toSmk: [smkExample],
      toCommander: [],
    });
  });

  it('on SMK: offers Commander, and SMK only if another host exists', () => {
    expect(getCliSwitchTargets([commander, smkExample], smkExample)).toEqual({
      toSmk: [],
      toCommander: [commander],
    });
    expect(
      getCliSwitchTargets([commander, smkExample, localhost], smkExample)
    ).toEqual({
      toSmk: [localhost],
      toCommander: [commander],
    });
  });

  it('offers nothing when only the active CLI is installed', () => {
    expect(getCliSwitchTargets([commander], commander)).toEqual({
      toSmk: [],
      toCommander: [],
    });
    expect(getCliSwitchTargets([smkExample], smkExample)).toEqual({
      toSmk: [],
      toCommander: [],
    });
  });

  it('offers every install when no CLI is active yet', () => {
    expect(getCliSwitchTargets([commander, smkExample])).toEqual({
      toSmk: [smkExample],
      toCommander: [commander],
    });
  });
});
