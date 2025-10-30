import { window } from 'vscode';
import { commonQuickPickOptions } from '../../../utils/helper';
import { BaseCommandHandler } from './baseCommandHandler';
import {
  BASE_HANDLER_MESSAGES,
  KEEPER_NOTATION_FIELD_TYPES,
} from '../../../utils/constants';
import {
  IField,
  IRecordQuickPick,
  IRecordQuickPickWithFieldType,
} from '../../../types/ksm';

export abstract class BaseGetValueHandler extends BaseCommandHandler {
  async showQuickPickForRecords(
    items: IRecordQuickPick[]
  ): Promise<IRecordQuickPick | undefined> {
    return await window.showQuickPick(items, {
      ...commonQuickPickOptions,
      title: BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_RECORDS_TITLE,
      placeHolder:
        BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_RECORDS_PLACEHOLDER,
    });
  }

  async showQuickPickForSelectedRecord(
    selectedRecord: IRecordQuickPick,
    items: IRecordQuickPickWithFieldType[]
  ): Promise<IRecordQuickPickWithFieldType | undefined> {
    return await window.showQuickPick(items, {
      ...commonQuickPickOptions,
      title:
        BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_SELECTED_RECORD_TITLE +
        ': ' +
        selectedRecord.label,
      placeHolder:
        BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_SELECTED_RECORD_PLACEHOLDER,
    });
  }

  fieldsToSkip = [
    'oneTimeCode',
    'Ref',
    'trafficEncryptionSeed',
    'colorScheme',
    'userRecords',
    'enableFullWindowDrag',
    'enableWallpaper',
    'ignoreCert',
    'recordingIncludeKeys',
    'resizeMethod',
    'allowUrlManipulation',
    'httpCredentialsUid',
    'autofillConfiguration',
    'ignoreInitialSslCert',
    'user_records',
    'adminCredentialUid',
    'configUid',
  ] as const;

  processFieldsData(
    fields: IField[],
    fieldType: KEEPER_NOTATION_FIELD_TYPES
  ): IRecordQuickPickWithFieldType[] {
    return fields
      .filter(
        (field) =>
          !this.fieldsToSkip.some((fieldToSkip) => field.type.includes(fieldToSkip))
      )
      .filter((field) => field.value.length > 0)
      .filter((field) => field.value.every(value => typeof value === 'string' || typeof value === 'number'))
      .map((field) => {
        const fieldName = field?.label?.length ? field.label : field.type;
        return {
          label: fieldName,
          value: fieldName,
          fieldType,
        };
      });
  }

  showFunctionalitySuccessMessage(
    selectedRecord: IRecordQuickPick,
    selectedField: IRecordQuickPickWithFieldType
  ): void {
    window.showInformationMessage(
      BASE_HANDLER_MESSAGES.INFO
        .REFERENCE_OF_FIELD_OF_SECRET_RETRIEVED_SUCCESSFULLY +
        ' with value: ' +
        selectedField.label +
        ' and secret: ' +
        selectedRecord.label
    );
  }
}
