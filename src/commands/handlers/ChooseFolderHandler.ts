import { ExtensionContext } from "vscode";
import { CliService } from "../../services/cli";
import { StatusBarSpinner } from "../../utils/helper";
import { BaseCommandHandler } from "./BaseCommandHandler";
import { StorageManager } from "../storage/StorageManager";

export class ChooseFolderHandler extends BaseCommandHandler {
    private storageManager: StorageManager;

    constructor(
        cliService: CliService,
        context: ExtensionContext,
        spinner: StatusBarSpinner,
        storageManager: StorageManager
    ) {
        super(cliService, context, spinner);
        this.storageManager = storageManager;
    }

    async execute(): Promise<void> {
        if (!await this.canExecute()) {
            return;
        }

        await this.storageManager.chooseFolder();
    }
} 