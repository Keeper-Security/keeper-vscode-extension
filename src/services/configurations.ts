import type { ConfigurationChangeEvent, Event, ExtensionContext } from "vscode";
import { EventEmitter, workspace } from "vscode";
import { CONFIG_NAMESPACE } from "../utils/constants";

export enum ConfigurationKey {
	DebugEnabled = "debug.enabled",
}

interface ConfigurationItems {
	[ConfigurationKey.DebugEnabled]: boolean;
}

class Configuration {
    public configure(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(this.onConfigurationChanged.bind(this), configuration)
        );
    }

    private _onDidChange = new EventEmitter<ConfigurationChangeEvent>();
    public get onDidChange(): Event<ConfigurationChangeEvent> {
        return this._onDidChange.event;
    }

    private onConfigurationChanged(event: ConfigurationChangeEvent): void {
        if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
            this._onDidChange.fire(event);
        }
    }

	public get<T extends ConfigurationItems[keyof ConfigurationItems]>(section: ConfigurationKey): T | undefined {
		return workspace.getConfiguration(CONFIG_NAMESPACE).get<T>(section);
	}

    public set(section: ConfigurationKey | string, value: any): Thenable<void> {
		return workspace.getConfiguration(CONFIG_NAMESPACE).update(section, value);
	}
}

export const configuration = new Configuration();