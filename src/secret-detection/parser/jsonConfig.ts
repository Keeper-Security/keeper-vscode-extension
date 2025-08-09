import { Position, Range, TextDocument } from "vscode";
import { Parser } from "./parser";

export default class JsonConfigParser extends Parser {
    public parse(): void {
        try {
            const text = this.document.getText();
            const json = JSON.parse(text);
            
            this.findSecretsInObject(json, '', 0);
        } catch (error) {
            // Invalid JSON, skip parsing
        }
    }

    private findSecretsInObject(obj: any, path: string, lineOffset: number): void {
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'string' && this.isSecretValue(value)) {
                const range = this.findValueRange(key, value);
                if (range) {
                    this.matches.push({ range, fieldValue: value });
                }
            } else if (typeof value === 'object' && value !== null) {
                this.findSecretsInObject(value, currentPath, lineOffset);
            }
        }
    }

    private isSecretValue(value: string): boolean {
        // Skip if already a Keeper reference
        if (value.startsWith('keeper://')) {
            return false;
        }

        // Skip if too short
        if (value.length < 8) {
            return false;
        }

        const secretPatterns = [
            /^sk-[a-zA-Z0-9]{20,}$/,
            /^pk_[a-zA-Z0-9]{20,}$/,
            /^[a-zA-Z0-9]{32,}$/,
            /^Bearer\s+[a-zA-Z0-9._-]+$/,
            /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            /^[A-Za-z0-9+/]{20,}={0,2}$/
        ];
        
        return secretPatterns.some(pattern => pattern.test(value));
    }

    private findValueRange(key: string, value: string): Range | null {
        const text = this.document.getText();
        const lines = text.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            
            // Look for the key-value pair in this line
            const keyValuePattern = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'g');
            let match;

            while ((match = keyValuePattern.exec(line)) !== null) {
                const matchedValue = match[1];
                
                // Check if this value matches our secret
                if (matchedValue === value) {
                    // Find the start position of the value (after the colon and quotes)
                    const valueStart = line.indexOf(`"${value}"`, match.index);
                    if (valueStart !== -1) {
                        // Add 1 to skip the opening quote
                        const startPos = valueStart + 1;
                        const endPos = startPos + value.length;
                        
                        return new Range(
                            new Position(lineIndex, startPos),
                            new Position(lineIndex, endPos)
                        );
                    }
                }
            }

            // Also check for unquoted values
            const unquotedPattern = new RegExp(`"${key}"\\s*:\\s*([^,\\s]+)`, 'g');
            while ((match = unquotedPattern.exec(line)) !== null) {
                const matchedValue = match[1];
                
                if (matchedValue === value) {
                    const valueStart = match.index + match[0].indexOf(matchedValue);
                    const endPos = valueStart + value.length;
                    
                    return new Range(
                        new Position(lineIndex, valueStart),
                        new Position(lineIndex, endPos)
                    );
                }
            }
        }

        return null;
    }
} 