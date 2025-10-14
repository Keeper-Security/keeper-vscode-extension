import { window } from 'vscode';
import { commonQuickPickOptions } from '../../../utils/helper';
import { BaseCommandHandler } from './baseCommandHandler';
import { KEEPER_NOTATION_FIELD_TYPES } from '../../../utils/constants';
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
      title: 'Available records from Keeper Vault',
      placeHolder: 'Select a record',
    });
  }

  async showQuickPickForSelectedRecord(
    selectedRecord: IRecordQuickPick,
      items: IRecordQuickPickWithFieldType[]
  ): Promise<IRecordQuickPickWithFieldType | undefined> {
    return await window.showQuickPick(items, {
      ...commonQuickPickOptions,
      title: `Available fields from record: ${selectedRecord.label}`,
      placeHolder: 'Which field do you want to retrieve?',
    });
  }

  processFieldsData(
    fields: IField[],
    fieldType: KEEPER_NOTATION_FIELD_TYPES
  ): IRecordQuickPickWithFieldType[] {
    return fields
      .filter((field) => field.value.length > 0)
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
      `Reference of "${selectedField.label}" field of secret "${selectedRecord.label}" retrieved successfully!`
    );
  }
}
