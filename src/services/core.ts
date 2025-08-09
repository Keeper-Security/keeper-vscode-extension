import { ExtensionContext } from "vscode";
import { CliService } from "./cli";
import { CommandService } from "../commands";
import { StatusBarSpinner } from "../utils/helper";
import { StorageManager } from "../commands/storage/StorageManager";
import { SecretDetectionService } from "./secretDetection";

export class Core {
    private cliService!: CliService;
    private commandService!: CommandService;
    private spinner: StatusBarSpinner;
    private storageManager!: StorageManager;
    private secretDetectionService!: SecretDetectionService;

    public constructor(public context: ExtensionContext) {
        this.spinner = new StatusBarSpinner();
        this.initializeServices();
    }

    private initializeServices(): void {
        this.cliService = new CliService(this.context, this.spinner);
        this.storageManager = new StorageManager(this.context, this.cliService, this.spinner);
        this.commandService = new CommandService(this.context, this.cliService, this.spinner, this.storageManager);
        this.secretDetectionService = new SecretDetectionService(this.context);
    }
}