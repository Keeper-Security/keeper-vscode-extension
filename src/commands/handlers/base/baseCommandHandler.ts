import { Range, window } from 'vscode';
import { logger } from '../../../utils/logger';

export interface ICommandHandler {
  execute(): Promise<void>;
}

export abstract class BaseCommandHandler implements ICommandHandler {
  constructor() {
    logger.logDebug(`Initializing ${this.constructor.name}`);
  }

  abstract execute(): Promise<void>;

  async insertKeeperRefInActiveTextEditor(
    reference: string,
    range?: Range
  ): Promise<boolean> {
    logger.logDebug(
      `Inserting keeper reference in active text editor - reference: ${reference}`
    );

    // get active text editor
    const editor = window.activeTextEditor;

    if (!editor) {
      logger.logError('No active text editor found. Cannot insert reference.');
      window.showErrorMessage(
        'No file is open. Please open a file first to insert the reference.'
      );
      return false;
    }

    try {
      await editor.edit((editBuilder) => {
        if (range) {
          editBuilder.replace(range, reference);
          logger.logDebug(
            `Replaced reference in range - file: ${editor.document.fileName}, range: ${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
          );
        } else {
          editBuilder.replace(editor.selection, reference);
          logger.logDebug(
            `Replaced reference in active text editor - file: ${editor.document.fileName}, selection: ${editor.selection.active.line}:${editor.selection.active.character}`
          );
        }
        logger.logDebug(`Keeper reference inserted successfully`);
      });
      return true;
    } catch (error) {
      logger.logError('Failed to insert keeper reference', error);
      window.showErrorMessage('Failed to insert reference. Please try again.');
      return false;
    }
  }
}
