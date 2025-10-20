import {
  ExtensionContext,
  Disposable,
  workspace,
  languages,
  TextDocument,
} from 'vscode';
import { logger } from '../utils/logger';
import { isEnvironmentFile } from '../utils/helper';
import { Parser } from '../secret-detection/parser/parser';
import DotEnvParser from '../secret-detection/parser/dotEnv';
import { SecretDetectionCodeLensProvider } from '../providers/secretDetectionCodeLensProvider';
import { configuration, ConfigurationKey } from './configurations';
import path from 'path';

export class SecretDetectionService {
  private subscriptions: Disposable[] = [];
  private codeLensProvider!: SecretDetectionCodeLensProvider;

  // @ts-ignore
  public constructor(private context: ExtensionContext) {
    logger.logDebug('Initializing SecretDetectionService');
    this.initialize();

    configuration.onDidChange(this.initialize.bind(this));
  }

  private initialize(): void {
    logger.logDebug('Starting secret detection initialization');
    // Clean up existing subscriptions
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }

    if (!configuration.get<boolean>(ConfigurationKey.SecretDetectionEnabled)) {
      logger.logDebug('Secret detection is disabled in the extension settings');
      return;
    }

    // Create CodeLens provider with parser-based detection
    this.codeLensProvider = new SecretDetectionCodeLensProvider(
      this.createParserFactory()
    );

    // Register the provider
    this.subscriptions = [
      languages.registerCodeLensProvider(
        { scheme: 'file' },
        this.codeLensProvider
      ),
      // Add refresh listeners
      workspace.onDidSaveTextDocument(() => {
        this.codeLensProvider.refresh();
      }),
    ];
    logger.logDebug('Secret detection initialization completed');
  }

  private createParserFactory() {
    return (document: TextDocument): Parser | null => {
      // const matchDocument = documentMatcher(document);

      // Environment files
      if (isEnvironmentFile(path.basename(document.fileName))) {
        return new DotEnvParser(document);
      }

      logger.logDebug('No suitable parser found for document type');
      return null;
    };
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    logger.logDebug('SecretDetectionService disposal completed');
  }
}
