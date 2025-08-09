import { ExtensionContext, Disposable, workspace, languages, TextDocument, CodeLens } from 'vscode';
import { logger } from '../utils/logger';
import { SecretDetectionCodeLensProvider } from '../providers/SecretDetectionCodeLensProvider';
import { documentMatcher } from '../utils/helper';
import { Parser } from '../secret-detection/parser/parser';
import JsonConfigParser from '../secret-detection/parser/jsonConfig';
import DotEnvParser from '../secret-detection/parser/dotEnv';
import YamlConfigParser from '../secret-detection/parser/yamlConfig';
import CodeParser from '../secret-detection/parser/codeParser';
// Import other parsers as needed

export class SecretDetectionService {
    private subscriptions: Disposable[] = [];
    private codeLensProvider!: SecretDetectionCodeLensProvider;

    public constructor(private context: ExtensionContext) {
        this.initialize();
    }

    private initialize(): void {
        // Clean up existing subscriptions
        for(const subscription of this.subscriptions) {
            subscription.dispose();
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
            // workspace.onDidChangeTextDocument(() => {
            //     // Debounced refresh for better performance
            //     this.debouncedRefresh();
            // })
        ];
    }

    private createParserFactory() {
        return (document: TextDocument): Parser | null => {
            const matchDocument = documentMatcher(document);
            
            // Environment files
            if (matchDocument(['plaintext'], ['env', 'env.local', 'env.production'])) {
                return new DotEnvParser(document);
            }
            
            // JSON configuration files
            if (matchDocument(['json'], ['json'])) {
                return new JsonConfigParser(document);
            }
            
            // YAML configuration files
            if (matchDocument(['yaml'], ['yml', 'yaml'])) {
                return new YamlConfigParser(document);
            }
            
            // Code files
            if (matchDocument(['javascript', 'typescript', 'python', 'go', 'java', 'csharp', 'php', 'ruby'], 
                             ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'java', 'cs', 'php', 'rb'])) {
                return new CodeParser(document);
            }
            
            return null; // No parser for this file type
        };
    }

    private debouncedRefresh = debounce(() => {
        this.codeLensProvider.refresh();
    }, 300);

    public dispose(): void {
        for(const subscription of this.subscriptions) {
            subscription.dispose();
        }
    }
}

// Utility function for debouncing
function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
} 