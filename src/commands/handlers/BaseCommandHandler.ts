import { ExtensionContext } from "vscode";
import { CliService } from "../../services/cli";
import { StatusBarSpinner } from "../../utils/helper";

export interface ICommandHandler {
    execute(): Promise<void>;
}

export abstract class BaseCommandHandler implements ICommandHandler {
    constructor(
        protected cliService: CliService,
        protected context: ExtensionContext,
        protected spinner: StatusBarSpinner
    ) {}

    abstract execute(): Promise<void>;
    
    protected async canExecute(): Promise<boolean> {
        return await this.cliService.isCLIReady();
    }
} 