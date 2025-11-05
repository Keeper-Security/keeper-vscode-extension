import { Position, Range, TextDocument } from 'vscode';
import { Parser } from './parser';
import { logger } from '../../utils/logger';
import { DOTENV_LINE } from '../../utils/constants';
import {
  isSecretValue,
  isSecretKey,
  isPlaceholder,
} from '../patterns/secretPatterns';

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
      let fieldValue = match[2] || '';
      // Remove whitespace
      fieldValue = fieldValue.trim();
      // Remove surrounding quotes
      fieldValue = fieldValue.replace(/^(["'`])([\S\s]*)\1$/gm, '$2');

      if (fieldValue.length === 0 || fieldValue.startsWith('keeper://')) {
        continue;
      }

      // Check if it's a secret
      if (this.isSecret(keyValue, fieldValue)) {
        logger.logDebug(
          `DotEnvParser: Secret detected at line ${lineNumber + 1} - Key: ${keyValue}, Value: ${fieldValue}`
        );
        const index = lineValue.indexOf(fieldValue);
        const range = new Range(
          new Position(lineNumber, index),
          new Position(lineNumber, index + fieldValue.length)
        );

        this.matches.push({ range, fieldValue });
      }
    }
  }

  private isSecret(key: string, value: string): boolean {
    // Skip if looks like a placeholder
    if (isPlaceholder(value)) {
      return false;
    }

    // Use centralized pattern matching
    const isSecretKeyMatch = isSecretKey(key);
    const isSecretValueMatch = isSecretValue(value);

    // if key OR value suggests secret, show CodeLens
    const result = isSecretKeyMatch || isSecretValueMatch;

    return result;
  }
}
