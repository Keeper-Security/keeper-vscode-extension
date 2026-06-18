import { window } from 'vscode';
import { IFolder } from '../../types';
import {
  commonQuickPickOptions,
  escapeCommanderDoubleQuotedValue,
  hasKeeperNotationControlCharacters,
} from '../../utils/helper';
import { CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER, KEEPER_RECORD_TYPES } from '../../utils/constants';
import { CLI_ERROR_MESSAGES, CLI_INFO_MESSAGES } from '../../utils/cli-messages';

export const RECORD_ADD_COMMANDS = {
  CLASSIC: 'record-add',
  NESTED_SHARE_FOLDER: 'nsf-record-add',
} as const;

export type RecordAddCommand =
  (typeof RECORD_ADD_COMMANDS)[keyof typeof RECORD_ADD_COMMANDS];

export type RecordAddFieldValue =
  | { kind: 'literal'; value: string }
  | { kind: 'generate'; token: '$GEN' };

export interface BuildRecordAddArgsOptions {
  title: string;
  recordType: KEEPER_RECORD_TYPES;
  fieldKey: string;
  fieldValue: RecordAddFieldValue;
  folderUid?: string;
}

function assertSafeCommanderRecordAddValue(value: string, label: string): void {
  if (hasKeeperNotationControlCharacters(value)) {
    throw new Error(
      `${CLI_ERROR_MESSAGES.INVALID_COMMANDER_RECORD_ADD_VALUE} (${label})`
    );
  }
}

function formatRecordAddFieldAssignment(
  fieldKey: string,
  fieldValue: RecordAddFieldValue
): string {
  const escapedKey = escapeCommanderDoubleQuotedValue(fieldKey);

  if (fieldValue.kind === 'generate') {
    return `"${escapedKey}"=${fieldValue.token}`;
  }

  assertSafeCommanderRecordAddValue(fieldValue.value, 'field value');
  return `"${escapedKey}"="${escapeCommanderDoubleQuotedValue(fieldValue.value)}"`;
}

/**
 * Build argv-style fragments for `record-add` / `nsf-record-add`.
 * User- and repository-controlled values are escaped before quoting so they
 * cannot inject additional Keeper Commander flags when joined for the
 * persistent shell.
 */
export function buildRecordAddArgs(
  options: BuildRecordAddArgsOptions
): string[] {
  const { title, recordType, fieldKey, fieldValue, folderUid } = options;

  assertSafeCommanderRecordAddValue(title, 'title');
  assertSafeCommanderRecordAddValue(fieldKey, 'field key');

  const args = [
    `--title="${escapeCommanderDoubleQuotedValue(title)}"`,
    `--record-type=${recordType}`,
    formatRecordAddFieldAssignment(fieldKey, fieldValue),
  ];

  // if currentStorage is not "My Vault", then add folder to args
  if (folderUid && folderUid !== '/') {
    assertSafeCommanderRecordAddValue(folderUid, 'folder');
    args.push(`--folder="${escapeCommanderDoubleQuotedValue(folderUid)}"`);
  }

  return args;
}

/**
 * Resolves which `record-add` command variant to use based on the current storage.
 *
 * - "My Vault" (root folder) — prompts the user to choose between the classic
 *   and the new (nested share folder) permission model.
 * - Nested share folder — `nsf-record-add` (no prompt).
 * - Any other folder — `record-add` (no prompt).
 *
 * Returns `undefined` only when the user dismisses the permission model quick pick.
 */
export async function resolveRecordAddCommand(
  currentStorage: IFolder | null
): Promise<RecordAddCommand | undefined> {
  if (currentStorage?.folderUid === '/') {
    return await promptForPermissionModel();
  }

  if (currentStorage?.source === CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER) {
    return RECORD_ADD_COMMANDS.NESTED_SHARE_FOLDER;
  }

  return RECORD_ADD_COMMANDS.CLASSIC;
}

async function promptForPermissionModel(): Promise<
  RecordAddCommand | undefined
> {
  const selection = await window.showQuickPick(
    [
      {
        label: 'Use classic permission model',
        value: RECORD_ADD_COMMANDS.CLASSIC,
      },
      {
        label: 'Use new permission model',
        value: RECORD_ADD_COMMANDS.NESTED_SHARE_FOLDER,
      },
    ],
    {
      title: CLI_INFO_MESSAGES.QUICK_PICK_FOR_PERMISSION_MODEL_TITLE,
      placeHolder:
        CLI_INFO_MESSAGES.QUICK_PICK_FOR_PERMISSION_MODEL_PLACEHOLDER,
      ...commonQuickPickOptions,
    }
  );

  return selection?.value;
}
