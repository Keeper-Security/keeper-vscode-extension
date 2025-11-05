import { Range, window } from 'vscode';
import { logger } from '../../../utils/logger';
import { BASE_HANDLER_MESSAGES } from '../../../utils/constants';

export interface ICommandHandler {
  execute(): Promise<void>;
}

export abstract class BaseCommandHandler implements ICommandHandler {
  constructor() {
    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.INITIALIZING
    );
  }

  abstract execute(): Promise<void>;

  async insertKeeperRefInActiveTextEditor(
    reference: string,
    range?: Range
  ): Promise<boolean> {
    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG
        .INSERTING_KEEPER_REFERENCE_IN_ACTIVE_TEXT_EDITOR +
        ' with reference: ' +
        reference
    );

    // get active text editor
    const editor = window.activeTextEditor;

    if (!editor) {
      logger.logError(
        this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_ERROR.NO_ACTIVE_TEXT_EDITOR_FOUND
      );
      window.showErrorMessage(
        BASE_HANDLER_MESSAGES.ERROR.NO_FILE_OPEN
      );
      return false;
    }

    try {
      await editor.edit((editBuilder) => {
        if (range) {
          editBuilder.replace(range, reference);
          logger.logDebug(
            this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.REPLACED_REFERENCE_IN_RANGE +
              ' with file: ' +
              editor.document.fileName +
              ' and range: ' +
              range.start.line +
              ':' +
              range.start.character +
              '-' +
              range.end.line +
              ':' +
              range.end.character
          );
        } else {
          editBuilder.replace(editor.selection, reference);
          logger.logDebug(
            this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.REPLACED_REFERENCE_IN_SELECTION +
              ' with file: ' +
              editor.document.fileName +
              ' and selection: ' +
              editor.selection.active.line +
              ':' +
              editor.selection.active.character
          );
        }
        logger.logDebug(
          this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG
            .KEEPER_REFERENCE_INSERTED_SUCCESSFULLY
        );
      });
      return true;
    } catch (error) {
      logger.logError(
        this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_ERROR.FAILED_TO_INSERT_KEEPER_REFERENCE +
          ' with error: ' +
          error
      );
      window.showErrorMessage(
        BASE_HANDLER_MESSAGES.ERROR.FAILED_TO_INSERT_REFERENCE
      );
      return false;
    }
  }
}
