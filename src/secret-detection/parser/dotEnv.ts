import { Position, Range, TextDocument } from "vscode";
import { Parser } from "./parser";

// Hat tip: https://github.com/motdotla/dotenv
export const DOTENV_LINE =
	/^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^\n\r#]+)?\s*(?:#.*)?$/;

export default class DotEnvParser extends Parser {
	public constructor(document: TextDocument) {
		super(document);
	}

	public parse(): void {
		for (
			let lineNumber = 0;
			lineNumber < this.document.lineCount;
			lineNumber++
		) {
			const lineValue = this.document.lineAt(lineNumber).text;
			const match = DOTENV_LINE.exec(lineValue);

			if (!match) {
				continue;
			}

			const keyValue = match[1];
			// Default nullish to empty string
			let fieldValue = match[2] || "";
			// Remove whitespace
			fieldValue = fieldValue.trim();
			// Remove surrounding quotes
			fieldValue = fieldValue.replace(/^(["'`])([\S\s]*)\1$/gm, "$2");

			if (fieldValue.length === 0 || fieldValue.startsWith('keeper://')) {
				continue;
			}

			// Check if it's a secret
			if (this.isSecret(keyValue, fieldValue)) {
				const index = lineValue.indexOf(fieldValue);
				const range = new Range(
					new Position(lineNumber, index),
					new Position(lineNumber, index + fieldValue.length),
				);

				this.matches.push({ range, fieldValue });
			}
		}
	}

	private isSecret(key: string, value: string): boolean {
		// Skip if too short
		if (value.length < 8) {
			return false;
		}

		// Skip if looks like a placeholder
		if (this.isPlaceholder(value)) {
			return false;
		}

		// Check if the key suggests it's a secret
		const secretKeyPatterns = [
			/api[_-]?key/i,
			/secret/i,
			/password/i,
			/token/i,
			/key/i,
			/auth/i,
			/credential/i,
			/private/i
		];

		const isSecretKey = secretKeyPatterns.some(pattern => pattern.test(key));

		// Check if the value matches secret patterns
		const secretValuePatterns = [
			/^sk-[a-zA-Z0-9]{20,}$/,
			/^pk_[a-zA-Z0-9]{20,}$/,
			/^[a-zA-Z0-9]{32,}$/,
			/^Bearer\s+[a-zA-Z0-9._-]+$/,
			/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			/^[A-Za-z0-9+/]{20,}={0,2}$/
		];

		const isSecretValue = secretValuePatterns.some(pattern => pattern.test(value));

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
			/^mock.*$/i
		];

		return placeholderPatterns.some(pattern => pattern.test(value));
	}
} 