import { window } from 'vscode';
import { IFolder } from '../../types';
import { commonQuickPickOptions } from '../../utils/helper';
import { CLI_FOLDER_SOURCE_NESTED_SHARE_FOLDER } from '../../utils/constants';
import { CLI_INFO_MESSAGES } from '../../utils/cli-messages';

export const RECORD_ADD_COMMANDS = {
  CLASSIC: 'record-add',
  NESTED_SHARE_FOLDER: 'nsf-record-add',
} as const;

export type RecordAddCommand =
  (typeof RECORD_ADD_COMMANDS)[keyof typeof RECORD_ADD_COMMANDS];

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
