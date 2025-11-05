import { Range, Selection, Uri, window, workspace } from 'vscode';
import { commonInputBoxOptions } from '../../../utils/helper';
import { logger } from '../../../utils/logger';
import { BaseCommandHandler } from './baseCommandHandler';
import { BASE_HANDLER_MESSAGES, KEEPER_FIELD_TYPES } from '../../../utils/constants';

export abstract class BaseSaveValueHandler extends BaseCommandHandler {
  async getRecordNameFromUser(): Promise<string | undefined> {
    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.GET_RECORD_NAME_FROM_USER
    );

    const recordName = await window.showInputBox({
      prompt: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PROMPT,
      placeHolder: BASE_HANDLER_MESSAGES.INPUT.RECORD_NAME_FROM_USER_PLACEHOLDER,
      ...commonInputBoxOptions,
    });

    return recordName;
  }

  async getSecretFieldNameFromUser(): Promise<string | undefined> {
    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.GET_RECORD_FIELD_NAME_FROM_USER
    );
    const secretFieldName = await window.showInputBox({
      prompt: BASE_HANDLER_MESSAGES.INPUT.RECORD_FIELD_NAME_FROM_USER_PROMPT,
      placeHolder: BASE_HANDLER_MESSAGES.INPUT.RECORD_FIELD_NAME_FROM_USER_PLACEHOLDER,
      ...commonInputBoxOptions,
    });

    if (!secretFieldName) {
      logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_RECORD_FIELD_NAME_PROVIDED);
      return;
    }

    logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_PROVIDED_RECORD_FIELD_NAME + ' with value: ' + secretFieldName);
    return secretFieldName;
  }

  getFieldType(fieldName: string): string {
    const patterns = {
      [KEEPER_FIELD_TYPES.SECRET]:
        /(password|secret|key|token|api[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token|bearer[_-]?token|jwt|session[_-]?id|session[_-]?token|refresh[_-]?token|client[_-]?secret|client[_-]?id|consumer[_-]?key|consumer[_-]?secret|oauth[_-]?token|oauth[_-]?secret|webhook[_-]?secret|signing[_-]?key|encryption[_-]?key|decryption[_-]?key|master[_-]?key|root[_-]?key|private[_-]?key|public[_-]?key|ssh[_-]?key|gpg[_-]?key|certificate|cert|pem|p12|pfx|keystore|truststore|pin|pincode|passcode|passphrase|seed|mnemonic|backup[_-]?code|recovery[_-]?code|totp[_-]?secret|2fa[_-]?secret|mfa[_-]?secret|authenticator[_-]?secret|verification[_-]?code|activation[_-]?code|license[_-]?key|product[_-]?key|serial[_-]?number|api[_-]?secret|webhook[_-]?key|signature|hash|checksum|md5|sha1|sha256|sha512|bcrypt|salt|nonce|iv|vector|credential|cred|auth[_-]?code|authorization[_-]?code|consent[_-]?token|identity[_-]?token|saml[_-]?token|openid[_-]?token|oidc[_-]?token|federation[_-]?token|sso[_-]?token|ldap[_-]?password|ad[_-]?password|domain[_-]?password|service[_-]?account[_-]?key|service[_-]?key|app[_-]?key|app[_-]?secret|application[_-]?key|application[_-]?secret|bot[_-]?token|webhook[_-]?url|callback[_-]?url|redirect[_-]?uri|client[_-]?certificate|server[_-]?certificate|ca[_-]?certificate|intermediate[_-]?certificate|chain[_-]?certificate|fullchain[_-]?certificate|private[_-]?certificate|public[_-]?certificate|ssl[_-]?certificate|tls[_-]?certificate|wildcard[_-]?certificate|domain[_-]?certificate|subdomain[_-]?certificate|wildcard[_-]?key|domain[_-]?key|subdomain[_-]?key|wildcard[_-]?secret|domain[_-]?secret|subdomain[_-]?secret|wildcard[_-]?token|domain[_-]?token|subdomain[_-]?token|wildcard[_-]?password|domain[_-]?password|subdomain[_-]?password|wildcard[_-]?credential|domain[_-]?credential|subdomain[_-]?credential|wildcard[_-]?auth|domain[_-]?auth|subdomain[_-]?auth|wildcard[_-]?key|domain[_-]?key|subdomain[_-]?key|wildcard[_-]?secret|domain[_-]?secret|subdomain[_-]?secret|wildcard[_-]?token|domain[_-]?token|subdomain[_-]?token|wildcard[_-]?password|domain[_-]?password|subdomain[_-]?password|wildcard[_-]?credential|domain[_-]?credential|subdomain[_-]?credential|wildcard[_-]?auth|domain[_-]?auth|subdomain[_-]?auth)/i,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(fieldName)) {
        logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.FIELD_MATCHED_TYPE + ' with value: ' + fieldName + ' and type: ' + type);
        return type;
      }
    }

    logger.logDebug(
      this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.FIELD_DEFAULTED_TO_TYPE + ' with value: ' + fieldName + ' and type: ' + KEEPER_FIELD_TYPES.TEXT
    );
    return KEEPER_FIELD_TYPES.TEXT;
  }

  async getSelectedText(
    secretValue?: string,
    range?: Range,
    documentUri?: Uri
  ): Promise<string | undefined> {
    let selectedText: string | undefined;
    let editor = window.activeTextEditor;

    // If called from CodeLens, use provided values
    if (secretValue && range && documentUri) {
      logger.logDebug(
        this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USING_CODELENS_VALUES + ' with value: ' + secretValue + ' and range: ' + range.start.line + ':' + range.start.character + '-' + range.end.line + ':' + range.end.character + ' and documentUri: ' + documentUri
      );
      selectedText = secretValue;
      // Open the document if not already active
      if (editor?.document.uri.toString() !== documentUri.toString()) {
        const document = await workspace.openTextDocument(documentUri);
        editor = await window.showTextDocument(document);
      }

      // Set the selection to the detected range
      if (editor) {
        editor.selection = new Selection(range.start, range.end);
      }
    } else {
      logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USING_MANUAL_SELECTION_MODE);

      // Manual selection mode
      selectedText = editor?.document.getText(editor?.selection);

      if (!selectedText) {
        logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.NO_TEXT_SELECTED_BY_USER);
        return;
      }
      logger.logDebug(this.constructor.name + ': ' + BASE_HANDLER_MESSAGES.LOGGER_DEBUG.USER_SELECTED_TEXT + ' with value: ' + selectedText);
    }

    return selectedText?.trim();
  }

  showFunctionalitySuccessMessage(storageName?: string): void {
    let message = BASE_HANDLER_MESSAGES.INFO.SECRET_SAVED_TO_KEEPER_VAULT;
    if (storageName) {
      message += ` at "${storageName}" folder successfully!`;
    }
    window.showInformationMessage(message);
  }
}
