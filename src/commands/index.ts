import { commands, ExtensionContext } from "vscode";
import { COMMANDS } from "../utils/constants";
import { CliService } from "../services/cli";
import { ICommandHandler } from "./handlers/BaseCommandHandler";
import { SaveValueHandler } from "./handlers/SaveValueHandler";
import { GetValueHandler } from "./handlers/GetValueHandler";
import { GeneratePasswordHandler } from "./handlers/GeneratePasswordHandler";
import { RunSecurelyHandler } from "./handlers/RunSecurelyHandler";
import { ChooseFolderHandler } from "./handlers/ChooseFolderHandler";
import { OpenLogsHandler } from "./handlers/OpenLogsHandler";
import { StorageManager } from "./storage/StorageManager";
import { StatusBarSpinner } from "../utils/helper";

export class CommandService {
    private handlers!: Map<string, ICommandHandler>;
    private storageManager: StorageManager;

    constructor(private context: ExtensionContext, cliService: CliService, private spinner: StatusBarSpinner, storageManager: StorageManager) {
        this.storageManager = storageManager;
        this.initializeHandlers(cliService);
        this.registerCommands();
    }

    private initializeHandlers(cliService: CliService): void {
        this.handlers = new Map([
            [COMMANDS.SAVE_VALUE_TO_VAULT, new SaveValueHandler(cliService, this.context, this.spinner, this.storageManager)],
            [COMMANDS.GET_VALUE_FROM_VAULT, new GetValueHandler(cliService, this.context, this.spinner)],
            [COMMANDS.GENERATE_PASSWORD, new GeneratePasswordHandler(cliService, this.context, this.spinner, this.storageManager)],
            [COMMANDS.RUN_SECURELY, new RunSecurelyHandler(cliService, this.context, this.spinner)],
            [COMMANDS.CHOOSE_FOLDER, new ChooseFolderHandler(cliService, this.context, this.spinner, this.storageManager)],
            [COMMANDS.OPEN_LOGS, new OpenLogsHandler()],
        ]);
    }

    private registerCommands(): void {
        this.handlers.forEach((handler, command) => {
            this.context.subscriptions.push(
                commands.registerCommand(command, (...args: any[]) => 
                    (handler as any).execute(...args)
                )
            );
        });
    }
}   