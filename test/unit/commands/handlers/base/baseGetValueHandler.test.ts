import { window } from 'vscode';
import { BaseGetValueHandler } from '../../../../../src/commands/handlers/base/baseGetValueHandler';
import { commonQuickPickOptions } from '../../../../../src/utils/helper';
import { BASE_HANDLER_MESSAGES, KEEPER_NOTATION_FIELD_TYPES } from '../../../../../src/utils/constants';
import { IRecordQuickPick, IRecordQuickPickWithFieldType, IField } from '../../../../../src/types/ksm';

// Mock dependencies
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  commonQuickPickOptions: {
    ignoreFocusOut: true,
    matchOnDetail: true,
    matchOnDescription: true,
  },
}));
jest.mock('../../../../../src/utils/logger');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
    })),
  },
}));

// Create a concrete implementation for testing
class TestGetValueHandler extends BaseGetValueHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseGetValueHandler', () => {
  let handler: TestGetValueHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestGetValueHandler();
  });

  describe('showQuickPickForRecords', () => {
    it('should show quick pick with correct options', async () => {
      const items: IRecordQuickPick[] = [
        { label: 'Record 1', value: 'uid1' },
        { label: 'Record 2', value: 'uid2' },
      ];
      const selectedItem = items[0];
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedItem);

      const result = await handler.showQuickPickForRecords(items);

      expect(window.showQuickPick).toHaveBeenCalledWith(items, {
        ...commonQuickPickOptions,
        title:
          BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_RECORDS_TITLE +
          ' (Showing compatible records)',
        placeHolder: BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_RECORDS_PLACEHOLDER,
      });
      expect(result).toEqual(selectedItem);
    });

    it('should return undefined when user cancels', async () => {
      const items: IRecordQuickPick[] = [{ label: 'Record 1', value: 'uid1' }];
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await handler.showQuickPickForRecords(items);

      expect(result).toBeUndefined();
    });
  });

  describe('showQuickPickForSelectedRecord', () => {
    it('should show quick pick with selected record in title', async () => {
      const selectedRecord: IRecordQuickPick = { label: 'My Record', value: 'uid jsem' };
      const items: IRecordQuickPickWithFieldType[] = [
        { label: 'password', value: 'password', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD },
      ];
      const selectedItem = items[0];
      (window.showQuickPick as jest.Mock).mockResolvedValue(selectedItem);

      const result = await handler.showQuickPickForSelectedRecord(selectedRecord, items);

      expect(window.showQuickPick).toHaveBeenCalledWith(items, {
        ...commonQuickPickOptions,
        title: BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_SELECTED_RECORD_TITLE + ': My Record',
        placeHolder: BASE_HANDLER_MESSAGES.INPUT.QUICK_PICK_FOR_SELECTED_RECORD_PLACEHOLDER,
      });
      expect(result).toEqual(selectedItem);
    });

    it('should return undefined when user cancels', async () => {
      const selectedRecord: IRecordQuickPick = { label: 'My Record', value: 'uid1' };
      const items: IRecordQuickPickWithFieldType[] = [
        { label: 'password', value: 'password', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD },
      ];
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await handler.showQuickPickForSelectedRecord(selectedRecord, items);

      expect(result).toBeUndefined();
    });
  });

  describe('processFieldsData', () => {
    it('should filter out fields in fieldsToSkip', () => {
      const fields: IField[] = [
        { type: 'oneTimeCode', label: 'OTP', value: ['123456'] },
        { type: 'login', label: 'Username', value: ['user'] },
        { type: 'Ref', label: 'Reference', value: ['ref'] },
        { type: 'password', label: 'Password', value: ['pass123'] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.FIELD);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Username');
      expect(result[1].label).toBe('Password');
    });

    it('should filter out empty fields', () => {
      const fields: IField[] = [
        { type: 'login', label: 'Username', value: ['user'] },
        { type: 'password', label: 'Password', value: [] },
        { type: 'text', label: 'Note', value: ['note'] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.FIELD);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Username');
      expect(result[1].label).toBe('Note');
    });

    it('should filter out fields with non-string/non-number values', () => {
      const fields: IField[] = [
        { type: 'login', label: 'Username', value: ['user'] },
        { type: 'password', label: 'Password', value: [{ invalid: 'object' } as any] },
        { type: 'text', label: 'Note', value: [123] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.FIELD);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Username');
      expect(result[1].label).toBe('Note');
    });

    it('should use label when available, otherwise use type', () => {
      const fields: IField[] = [
        { type: 'login', label: 'Custom Username', value: ['user'] },
        { type: 'password', label: '', value: ['pass'] },
        { type: 'text', label: '', value: ['note'] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD);

      expect(result[0].label).toBe('Custom Username');
      expect(result[1].label).toBe('password');
      expect(result[2].label).toBe('text');
    });

    it('should set correct fieldType in result', () => {
      const fields: IField[] = [
        { type: 'login', label: 'Username', value: ['user'] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD);

      expect(result[0].fieldType).toBe(KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD);
    });

    it('should handle all fieldsToSkip values', () => {
      const skipFields = handler.fieldsToSkip;
      const fields: IField[] = skipFields.map((fieldType, index) => ({
        type: fieldType,
        label: `Field ${index}`,
        value: ['value'],
      }));

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.FIELD);

      expect(result).toHaveLength(0);
    });

    it('should handle partial matches in field type', () => {
      const fields: IField[] = [
        { type: 'oneTimeCodeField', label: 'OTP', value: ['123'] },
        { type: 'login', label: 'Username', value: ['user'] },
      ];

      const result = handler.processFieldsData(fields, KEEPER_NOTATION_FIELD_TYPES.FIELD);

      // Should filter out because 'oneTimeCodeField' includes 'oneTimeCode'
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Username');
    });
  });

  describe('showFunctionalitySuccessMessage', () => {
    it('should show success message with record and field info', () => {
      const selectedRecord: IRecordQuickPick = { label: 'My Record', value: 'uid1' };
      const selectedField: IRecordQuickPickWithFieldType = {
        label: 'password',
        value: 'password',
        fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD,
      };

      handler.showFunctionalitySuccessMessage(selectedRecord, selectedField);

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.REFERENCE_OF_FIELD_OF_SECRET_RETRIEVED_SUCCESSFULLY +
          ' with value: password and secret: My Record'
      );
    });
  });
});
