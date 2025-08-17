/* eslint-disable @typescript-eslint/no-explicit-any */
import { IFolder, IVaultFolder } from '../types';
import {
  KEEPER_NOTATION_FIELD_TYPES,
  KEEPER_NOTATION_PATTERNS,
} from './constants';
import { logger } from './logger';
import {
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  window,
} from 'vscode';

export function validateKeeperReference(reference: string): boolean {
  logger.logDebug(`Validating keeper reference: ${reference}`);
  const isValid = KEEPER_NOTATION_PATTERNS.FIELD.test(reference);
  logger.logDebug(`Keeper reference validation result: ${isValid}`);
  return isValid;
}

export function createKeeperReference(
  recordUid: string,
  fieldType: KEEPER_NOTATION_FIELD_TYPES,
  itemName: string
): string | null {
  logger.logDebug(
    `Creating keeper reference - recordUid: ${recordUid}, fieldType: ${fieldType}, itemName: ${itemName}`
  );

  if (!recordUid) {
    logger.logError('recordUid is required to create a keeper reference');
    return null;
  }
  if (!itemName) {
    logger.logError('itemName is required to create a keeper reference');
    return null;
  }

  const reference = `keeper://${recordUid}/${fieldType}/${itemName}`;
  logger.logDebug(`Created keeper reference: ${reference}`);
  return reference;
}

export function promisifyExec(
  fn: Function
): (...args: any[]) => Promise<{ stdout: string; stderr: string }> {
  return function (...args: any[]) {
    return new Promise((resolve, reject) => {
      fn(...args, (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  };
}

export function parseKeeperReference(
  reference: string
): {
  recordUid: string;
  fieldType: KEEPER_NOTATION_FIELD_TYPES;
  itemName: string;
} | null {
  logger.logDebug(`Parsing keeper reference: ${reference}`);

  // Check if the reference is vaild keeper notation
  if (!validateKeeperReference(reference)) {
    logger.logError(`Invalid keeper notation reference: ${reference}`);
    return null;
  }

  // Parse the reference
  const removedKeeperPrefix = reference.replace('keeper://', '');
  const [recordUid, fieldType, itemName] = removedKeeperPrefix.split('/');

  const result = {
    recordUid,
    fieldType: fieldType as KEEPER_NOTATION_FIELD_TYPES,
    itemName,
  };
  logger.logDebug(`Parsed keeper reference:`, result);
  return result;
}

export class StatusBarSpinner {
  private statusBarItem: StatusBarItem;
  private interval: NodeJS.Timeout | null = null;
  private currentMessage: string = '';
  private isVisible: boolean = false;
  private autoHideTimeout: NodeJS.Timeout | null = null;
  private readonly AUTO_HIDE_DELAY = 120000; // 2 minutes in milliseconds

  constructor() {
    this.statusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Left,
      100
    );
  }

  public show(message: string): void {
    logger.logDebug(`Showing spinner with message: ${message}`);
    this.currentMessage = message;
    this.statusBarItem.text = `$(sync~spin) ${message}`;
    this.statusBarItem.tooltip = message;
    this.statusBarItem.show();
    this.isVisible = true;

    // Clear any existing auto-hide timeout
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }

    // Set auto-hide timeout
    this.autoHideTimeout = setTimeout(() => {
      if (this.isVisible) {
        this.hide();
      }
    }, this.AUTO_HIDE_DELAY);

    // Start the spinning animation
    this.interval = setInterval(() => {
      if (this.isVisible) {
        this.statusBarItem.text = `$(sync~spin) ${this.currentMessage}`;
      }
    }, 100);
  }

  public updateMessage(message: string): void {
    logger.logDebug(`Updating spinner message to: ${message}`);
    this.currentMessage = message;
    if (this.isVisible) {
      this.statusBarItem.text = `$(sync~spin) ${this.currentMessage}`;
    }
  }

  public hide(): void {
    logger.logDebug('Hiding spinner');
    this.isVisible = false;
    
    // Clear auto-hide timeout
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }
    
    // Clear spinning animation
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.statusBarItem.hide();
  }

  public dispose(): void {
    logger.logDebug('Disposing spinner');
    this.hide();
    this.statusBarItem.dispose();
  }
}

export function resolveFolderPaths(folders: IVaultFolder[]): IFolder[] {
  logger.logDebug(`Resolving paths for ${folders.length} folders`);
  // Map folderUid to folder for quick lookup
  const folderMap = new Map<string, IVaultFolder>();
  folders.forEach((folder) => folderMap.set(folder.folder_uid, folder));

  const result = folders.map((folder) => {
    const pathParts: string[] = [folder.name];
    let currentParentUid = folder.parent_uid;

    while (currentParentUid !== '/') {
      const parent = folderMap.get(currentParentUid);
      if (!parent) {
        break;
      }
      pathParts.unshift(parent.name);
      currentParentUid = parent.parent_uid;
    }

    pathParts.unshift('My Vault');

    return {
      folderUid: folder['folder_uid'],
      name: folder['name'],
      parentUid: folder['parent_uid'],
      folderPath: pathParts.join(' / '),
    };
  });

  logger.logDebug(`Resolved paths for ${result.length} folders`);
  return result;
}

export const documentMatcher =
  (document: TextDocument): ((ids: string[], exts: string[]) => boolean) =>
  (ids: string[], exts: string[]) =>
    ids.includes(document.languageId) ||
    exts.some((ext) => document.fileName.endsWith(`.${ext}`));

/**
 * Check if a file is an environment file using dynamic patterns
 */
export const isEnvironmentFile = (filename: string): boolean => {
  const lowerFilename = filename.toLowerCase();

  // Single regex for all .env variants
  return /^\.?env(?:\.|$|\.(?:[a-zA-Z0-9_-]+))?$/.test(lowerFilename);
};
