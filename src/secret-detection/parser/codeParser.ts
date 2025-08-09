import { Position, Range, TextDocument } from "vscode";
import { Parser } from "./parser";

// Generic patterns for secret detection in code files
const CODE_SECRET_PATTERNS = [
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
    
    // Cloud provider keys
    { pattern: /^AKIA[0-9A-Z]{16}$/, type: 'aws_access_key' },
    { pattern: /^[0-9a-zA-Z/+]{40}$/, type: 'aws_secret_key' },
    { pattern: /^ya29\.[0-9A-Za-z\-_]+$/, type: 'google_oauth' }
];

// Common variable names that might contain secrets
const CODE_SECRET_KEY_PATTERNS = [
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
    /app[_-]?secret/i,
    /db[_-]?password/i,
    /database[_-]?url/i,
    /connection[_-]?string/i
];

export default class CodeParser extends Parser {
    public parse(): void {
        try {
            const text = this.document.getText();
            const lines = text.split('\n');
            
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                this.processCodeLine(line, lineIndex);
            }
        } catch (error) {
            // Invalid code, skip parsing
        }
    }

    private processCodeLine(line: string, lineIndex: number): void {
        // Skip comments and empty lines
        if (this.isCommentOrEmpty(line)) {
            return;
        }

        // Find assignments (only one per line)
        const assignment = this.findAssignment(line);
        
        if (assignment && this.isSecret(assignment.key, assignment.value)) {
            const range = new Range(
                new Position(lineIndex, assignment.valueStart),
                new Position(lineIndex, assignment.valueEnd)
            );
            
            this.matches.push({
                range,
                fieldValue: assignment.value
            });
        }
    }

    private findAssignment(line: string): {
        key: string;
        value: string;
        valueStart: number;
        valueEnd: number;
    } | null {
        // Try different patterns in order of specificity
        
        // 1. Variable assignments: const/let/var key = "value"
        const varPattern = /(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*["']([^"']+)["']/;
        let match = line.match(varPattern);
        if (match) {
            const key = match[1];
            const value = match[2];
            
            if (value && value.length >= 8) {
                return {
                    key,
                    value,
                    valueStart: line.indexOf(`"${value}"`) + 1, // +1 to skip opening quote
                    valueEnd: line.indexOf(`"${value}"`) + 1 + value.length
                };
            }
        }

        // 2. Object properties: key: "value"
        const objPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*["']([^"']+)["']/;
        match = line.match(objPattern);
        if (match) {
            const key = match[1];
            const value = match[2];
            
            if (value && value.length >= 8) {
                return {
                    key,
                    value,
                    valueStart: line.indexOf(`"${value}"`) + 1,
                    valueEnd: line.indexOf(`"${value}"`) + 1 + value.length
                };
            }
        }

        // 3. Simple assignments: key = "value"
        const simplePattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*["']([^"']+)["']/;
        match = line.match(simplePattern);
        if (match) {
            const key = match[1];
            const value = match[2];
            
            if (value && value.length >= 8) {
                return {
                    key,
                    value,
                    valueStart: line.indexOf(`"${value}"`) + 1,
                    valueEnd: line.indexOf(`"${value}"`) + 1 + value.length
                };
            }
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
        const isSecretKey = CODE_SECRET_KEY_PATTERNS.some(pattern => pattern.test(key));

        // Check if the value matches secret patterns
        const isSecretValue = CODE_SECRET_PATTERNS.some(({ pattern }) => pattern.test(value));

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
        // Handle different comment styles
        const commentPatterns = [
            /^\s*\/\//,  // JavaScript/TypeScript/Java/C# single line
            /^\s*#/,     // Python/Ruby/Bash single line
            /^\s*\/\*/,  // JavaScript/TypeScript/Java/C# multi-line start
            /^\s*\*/,    // JavaScript/TypeScript/Java/C# multi-line continuation
            /^\s*<!--/,  // HTML/XML comment start
            /^\s*-->/,   // HTML/XML comment end
            /^\s*$/,     // Empty line
            /^\s*\/\/\/\//, // Documentation comments
            /^\s*#\s*!/, // Shebang
        ];

        return commentPatterns.some(pattern => pattern.test(line));
    }
} 