import { KEEPER_NOTATION_FIELD_TYPES } from '../utils/constants';

export interface IFolder {
  folderUid: string;
  name: string;
  parentUid: string;
  folderPath?: string;
  source: string;
}

export interface ICliListFolderResponse {
  folder_uid: string;
  name: string;
  parent_uid: string;
  flags?: string;
}

export interface IKsmGetFoldersResponse {
  folderUid: string;
  name: string;
  parentUid?: string;
}

export interface ICurrentStorage {
  folderUid: string;
  name: string;
  parentUid: string;
  folderPath?: string;
}

export interface IField {
  type: string;
  label: string;
  value: string[];
  fieldType?: KEEPER_NOTATION_FIELD_TYPES;
}

export interface ICliListRecordResponse {
  record_uid: string;
  title: string;
  record_category: string;
}

export interface ICliNsfListRecordResponse {
  UID: string;
  Title: string;
}

export interface ICliListFolderResponse {
  uid: string;
  name: string;
  details: string;
  source: string;
}

export interface ICliGetFolderResponse {
  folder_uid: string;
  type?: string;
  name: string;
  parent_uid?: string;
}

export enum ModeType {
  CLI = 'cli',
  KSM = 'ksm',
}

export type Mode = ModeType.CLI | ModeType.KSM;

/**
 * Which Keeper CLI distribution an install belongs to. Both print the same
 * `--version` banner, so the flavor is decided by executable name and install
 * location, never by version text.
 */
export enum CliFlavor {
  /** Keeper Commander (`pip install keepercommander` or the native installer), run as `keeper`. */
  COMMANDER = 'commander',
  /** Keeper SMK, run through `~/.keeper-smk/<host>/bin/keeper-smk`. */
  SMK = 'smk',
}

/** `keeper-security.cli.flavor` setting value. */
export type CliFlavorSetting = 'auto' | CliFlavor;

/** One working Keeper CLI found on this machine. */
export interface ICliInstall {
  /**
   * What the extension executes: an absolute file path, or (when `isCommand` is
   * true) a space-separated command resolved by the OS, e.g. `python3 -m keepercommander`.
   */
  path: string;
  /** Symlink-resolved path of the executed file. Used to deduplicate installs. */
  realPath: string;
  flavor: CliFlavor;
  version?: string;
  /** The `<host>` directory under `~/.keeper-smk/` (domain, `localhost`, IP, `host:port`). */
  smkHost?: string;
  isCommand?: boolean;
  /** Commander installed with pip, as opposed to the native installer. Preferred by default. */
  isPip?: boolean;
}

/** How to start a process: file plus argv, never a shell string. */
export interface ISpawnSpec {
  file: string;
  args: string[];
}

/** Everything CLI detection needs to know about the machine, passed in for testability. */
export interface ICliEnvironment {
  isWindows: boolean;
  /** Home directories to scan for `.keeper-smk/<host>/bin/keeper-smk`. */
  homeDirs: string[];
  /** Directories to search for `keeper-smk` and `keeper` (PATH plus common extras). */
  pathDirs: string[];
  /** Extra absolute paths where Commander is commonly installed. */
  knownCommanderPaths: string[];
  /** OS-resolved commands tried only when no Commander executable was found. */
  fallbackCommands: string[];
}

/** A CLI file that exists but isn't usable, and why. */
export interface ICliRejectedCandidate {
  path: string;
  reason: string;
}

export interface ICliDetectionResult {
  installs: ICliInstall[];
  rejected: ICliRejectedCandidate[];
}

/** The user's explicit pick of a Keeper CLI (Switch to CLI / Keeper SMK / Keeper Commander). */
export interface ISavedCliChoice {
  id: string;
  label?: string;
}

export interface ICliSettings {
  flavor: CliFlavorSetting;
  /** Explicit executable; wins over detection when set. */
  path?: string;
}

export type CliVersionProbeResult =
  | { ok: true; output: string }
  | { ok: false; reason: string };

/** Runs `<cli> --version`; `ok` when it exits 0 and prints "Keeper Commander". */
export type CliVersionProbe = (spec: ISpawnSpec) => Promise<CliVersionProbeResult>;

export type CliDetectorLog = (level: 'info' | 'warn', message: string) => void;

export type CliResolution =
  | {
      kind: 'active';
      install: ICliInstall;
      source: 'override' | 'saved' | 'single' | 'auto';
      /** Several installs and none chosen: tell the user how to switch. */
      autoPickedFromMany: boolean;
    }
  | { kind: 'savedMissing'; saved: ISavedCliChoice; available: ICliInstall[] }
  | { kind: 'overrideInvalid'; path: string; rejected: ICliRejectedCandidate[] }
  | { kind: 'noneFound'; rejected: ICliRejectedCandidate[] };

export type CliUnavailableResolution = Exclude<CliResolution, { kind: 'active' }>;

/** Installs the user can switch to from the active CLI (CLI mode switch commands). */
export interface ICliSwitchTargets {
  /** SMK hosts other than the active one. */
  toSmk: Omit<ICliInstall, 'version'>[];
  /** Commander installs; empty while Commander is already active. */
  toCommander: Omit<ICliInstall, 'version'>[];
}
