import { IFolder, IVaultFolder } from "../types";
import { KEEPER_NOTATION_FIELD_TYPES, KEEPER_NOTATION_PATTERNS } from "./constants";
import { logger } from "./logger";
import { StatusBarAlignment, TextDocument, window } from "vscode";

export function validateKeeperReference(reference: string): boolean {
    return KEEPER_NOTATION_PATTERNS.FIELD.test(reference);
}

export function createKeeperReference(recordUid: string, fieldType: KEEPER_NOTATION_FIELD_TYPES, itemName: string): string | null {
    if (!recordUid) {
        logger.logError("recordUid is required to create a keeper reference");
        return null;
    }
    if (!itemName) {
        logger.logError("itemName is required to create a keeper reference");
        return null;
    }

    return `keeper://${recordUid}/${fieldType}/${itemName}`;
}

export function promisifyExec(fn: Function): (...args: any[]) => Promise<{ stdout: string, stderr: string }> {
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

export function parseKeeperReference(reference: string): { recordUid: string, fieldType: KEEPER_NOTATION_FIELD_TYPES, itemName: string } | null {
    // Check if the reference is vaild keeper notation
    if (!validateKeeperReference(reference)) {
        logger.logError(`Invalid keeper notation reference: ${reference}`);
        return null;
    }

    // Parse the reference
    const removedKeeperPrefix = reference.replace('keeper://', '');
    const [recordUid, fieldType, itemName] = removedKeeperPrefix.split('/');

    return { recordUid, fieldType: fieldType as KEEPER_NOTATION_FIELD_TYPES, itemName };

}

export class StatusBarSpinner {
    private statusBarItem: any;
    private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentIndex = 0;
    private interval: NodeJS.Timeout | null = null;
    private currentMessage: string = '';

    constructor() {
        this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    }

    public show(message: string): void {
        this.currentMessage = message;
        this.statusBarItem.text = `${this.spinnerChars[this.currentIndex]} ${message}`;
        this.statusBarItem.show();

        this.interval = setInterval(() => {
            this.currentIndex = (this.currentIndex + 1) % this.spinnerChars.length;
            this.statusBarItem.text = `${this.spinnerChars[this.currentIndex]} ${this.currentMessage}`;
        }, 100);
    }

    public updateMessage(message: string): void {
        this.currentMessage = message;
        this.statusBarItem.text = `${this.spinnerChars[this.currentIndex]} ${message}`;
    }

    public hide(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.statusBarItem.hide();
    }

    public dispose(): void {
        this.hide();
        this.statusBarItem.dispose();
    }
}

export function resolveFolderPaths(folders: IVaultFolder[]): IFolder[] {
    // Map folderUid to folder for quick lookup
    const folderMap = new Map<string, IVaultFolder>();
    folders.forEach(folder => folderMap.set(folder.folder_uid, folder));

    return folders.map(folder => {
        const pathParts: string[] = [folder.name];
        let currentParentUid = folder.parent_uid;

        while (currentParentUid !== "/") {
            const parent = folderMap.get(currentParentUid);
            if (!parent) break;
            pathParts.unshift(parent.name);
            currentParentUid = parent.parent_uid;
        }

        pathParts.unshift("My Vault");

        return {
            folderUid: folder["folder_uid"],
            name: folder["name"],
            parentUid: folder["parent_uid"],
            folderPath: pathParts.join(" / ")
        };
    });
}

export const documentMatcher =
    (document: TextDocument) => (ids: string[], exts: string[]) =>
        ids.includes(document.languageId) ||
        exts.some((ext) => document.fileName.endsWith(`.${ext}`));