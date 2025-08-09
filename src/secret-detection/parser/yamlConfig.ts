import { Position, Range, TextDocument } from "vscode";
import { Parser, ParserMatch } from "./parser";

// YAML-specific patterns for secret detection
const YAML_SECRET_PATTERNS = [
    // API Keys
    { pattern: /^sk-[a-zA-Z0-9]{20,}$/, type: 'api_key' },
    { pattern: /^pk_[a-zA-Z0-9]{20,}$/, type: 'api_key' },
    { pattern: /^[a-zA-Z0-9]{32,}$/, type: 'api_key' },
    
    // Database URLs
    { pattern: /^(mongodb|postgresql|mysql|redis):\/\/[^@]+@[^:]+:\d+\/[^?]+/, type: 'database_url' },
    { pattern: /^[a-zA-Z]+:\/\/[^@]+@[^:]+:\d+\//, type: 'database_url' },
    
    // JWT Tokens
    { pattern: /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/, type: 'jwt_token' },
    
    // Bearer Tokens
    { pattern: /^Bearer\s+[a-zA-Z0-9._-]+$/, type: 'bearer_token' },
    
    // Passwords
    { pattern: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/, type: 'password' },
    
    // UUIDs
    { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, type: 'uuid' },
    
    // Base64 encoded secrets
    { pattern: /^[A-Za-z0-9+/]{20,}={0,2}$/, type: 'base64_secret' },
    
    // Hex encoded secrets
    { pattern: /^[0-9a-fA-F]{32,}$/, type: 'hex_secret' },
    
    // Docker registry passwords
    { pattern: /^[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/, type: 'docker_auth' },
    
    // Cloud provider keys
    { pattern: /^AKIA[0-9A-Z]{16}$/, type: 'aws_access_key' },
    { pattern: /^[0-9a-zA-Z/+]{40}$/, type: 'aws_secret_key' },
    { pattern: /^ya29\.[0-9A-Za-z\-_]+$/, type: 'google_oauth' }
];

// Common YAML keys that might contain secrets
const YAML_SECRET_KEY_PATTERNS = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /private/i,
    /signature/i,
    /salt/i,
    /hash/i,
    /access[_-]?key/i,
    /secret[_-]?key/i,
    /client[_-]?secret/i,
    /app[_-]?secret/i
];

export default class YamlConfigParser extends Parser {
    public parse(): void {
        try {
            const text = this.document.getText();
            const lines = text.split('\n');
            
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                this.processYamlLine(line, lineIndex);
            }
        } catch (error) {
            // Invalid YAML, skip parsing
        }
    }

    private processYamlLine(line: string, lineIndex: number): void {
        // Skip comments and empty lines
        if (this.isCommentOrEmpty(line)) {
            return;
        }

        // Parse YAML key-value pairs
        const keyValueMatch = this.parseYamlKeyValue(line);
        if (keyValueMatch) {
            const { key, value, keyStart, valueStart, valueEnd } = keyValueMatch;
            
            if (this.isSecret(key, value)) {
                const range = new Range(
                    new Position(lineIndex, valueStart),
                    new Position(lineIndex, valueEnd)
                );
                
                this.matches.push({
                    range,
                    fieldValue: value
                });
            }
        }
    }

    private parseYamlKeyValue(line: string): {
        key: string;
        value: string;
        keyStart: number;
        valueStart: number;
        valueEnd: number;
    } | null {
        // Handle different YAML value formats
        
        // 1. Array format: - KEY=value (for environment variables)
        const arrayMatch = line.match(/^(\s*)-\s*([^=]+)=(.+)$/);
        if (arrayMatch) {
            const [, indent, key, value] = arrayMatch;
            const cleanValue = value.trim();
            
            // Skip if value looks like a comment or is empty
            if (cleanValue.startsWith('#') || cleanValue === '') {
                return null;
            }
            
            const keyStart = indent.length + 2; // +2 for "- "
            const valueStart = line.indexOf(cleanValue);
            const valueEnd = valueStart + cleanValue.length;
            
            return {
                key: key.trim(),
                value: cleanValue,
                keyStart,
                valueStart,
                valueEnd
            };
        }

        // 2. Quoted strings: key: "value"
        const quotedMatch = line.match(/^(\s*)([^:]+):\s*["']([^"']*)["']/);
        if (quotedMatch) {
            const [, indent, key, value] = quotedMatch;
            const keyStart = indent.length;
            const valueStart = line.indexOf(`"${value}"`);
            const valueEnd = valueStart + value.length;
            
            return {
                key: key.trim(),
                value,
                keyStart,
                valueStart,
                valueEnd
            };
        }

        // 3. Unquoted strings: key: value
        const unquotedMatch = line.match(/^(\s*)([^:]+):\s*(.+)$/);
        if (unquotedMatch) {
            const [, indent, key, value] = unquotedMatch;
            const cleanValue = value.trim();
            
            // Skip if value looks like a comment or is empty
            if (cleanValue.startsWith('#') || cleanValue === '') {
                return null;
            }
            
            const keyStart = indent.length;
            const valueStart = line.indexOf(cleanValue);
            const valueEnd = valueStart + cleanValue.length;
            
            return {
                key: key.trim(),
                value: cleanValue,
                keyStart,
                valueStart,
                valueEnd
            };
        }
        
        return null;
    }

    private isSecret(key: string, value: string): boolean {
        // Skip if already a Keeper reference
        if (value.startsWith('keeper://')) {
            return false;
        }

        // Skip if too short
        if (value.length < 8) {
            return false;
        }

        // Skip if looks like a placeholder
        if (this.isPlaceholder(value)) {
            return false;
        }

        // Check if the key suggests it's a secret
        const isSecretKey = YAML_SECRET_KEY_PATTERNS.some(pattern => pattern.test(key));

        // Check if the value matches secret patterns
        const isSecretValue = YAML_SECRET_PATTERNS.some(({ pattern }) => pattern.test(value));

        // Simple logic: if key OR value suggests secret, show CodeLens
        return isSecretKey || isSecretValue;
    }

    private isPlaceholder(value: string): boolean {
        const placeholderPatterns = [
            /^<.*>$/,
            /^\[.*\]$/,
            /^\{.*\}$/,
            /^placeholder$/i,
            /^example$/i,
            /^your_.*$/i,
            /^enter_.*$/i,
            /^test.*$/i,
            /^demo.*$/i,
            /^sample.*$/i,
            /^temp.*$/i,
            /^fake.*$/i,
            /^mock.*$/i,
            /^xxx.*$/i,
            /^123.*$/,
            /^password.*$/i,
            /^secret.*$/i
        ];

        return placeholderPatterns.some(pattern => pattern.test(value));
    }

    private isCommentOrEmpty(line: string): boolean {
        return /^\s*#/.test(line) || /^\s*$/.test(line);
    }
} 