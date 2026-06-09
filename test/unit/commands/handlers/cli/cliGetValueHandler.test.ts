import { window } from 'vscode';
import { CliGetValueHandler } from '../../../../../src/commands/handlers/cli/cliGetValueHandler';
import { CliService } from '../../../../../src/services/cli';
import { CliStorageManager } from '../../../../../src/commands/storage/cliStorageManager';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import {
  CLI_ERROR_MESSAGES,
  CLI_INFO_MESSAGES,
  CLI_LOGGER_DEBUG_MESSAGES,
  CLI_LOGGER_ERROR_MESSAGES,
  CLI_SUCCESS_MESSAGES,
} from '../../../../../src/utils/cli-messages';
import {
  CLI_FOLDER_SOURCE_LEGACY,
  CLI_RECORD_CATEGORY_CLASSIC,
  KEEPER_NOTATION_FIELD_TYPES,
} from '../../../../../src/utils/constants';
import { ICliListRecordResponse } from '../../../../../src/types';
import { IRecordQuickPick } from '../../../../../src/types/ksm';

// Mock dependencies
jest.mock('../../../../../src/services/cli');
jest.mock('../../../../../src/commands/storage/cliStorageManager');
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  createKeeperReference: jest.fn(),
  safeJsonParse: jest.fn(),
}));

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    activeTextEditor: null,
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

// Get mocked functions
const { createKeeperReference, safeJsonParse } = require('../../../../../src/utils/helper');

describe('CliGetValueHandler', () => {
  let mockCliService: jest.Mocked<CliService>;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockStorageManager: jest.Mocked<CliStorageManager>;
  let cliGetValueHandler: CliGetValueHandler;
  let mockActiveTextEditor: any;

  // Default current storage used by most tests: a Legacy (classic) folder so the
  // handler routes to the `list --format=json` command path.
  const legacyFolderStorage = {
    folderUid: 'folder123',
    name: 'Classic Folder',
    parentUid: '/',
    folderPath: '/Classic Folder',
    source: CLI_FOLDER_SOURCE_LEGACY,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCliService = {
      isCLIReady: jest.fn(),
      executeCommanderCommand: jest.fn(),
    } as unknown as jest.Mocked<CliService>;

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockStorageManager = {
      getCurrentStorage: jest.fn().mockReturnValue(legacyFolderStorage),
    } as unknown as jest.Mocked<CliStorageManager>;

    mockActiveTextEditor = {
      document: {
        uri: { fsPath: '/test/file.txt' },
        fileName: 'file.txt',
      },
      selection: {
        active: { line: 0, character: 0 },
      },
      edit: jest.fn().mockResolvedValue(true),
    };

    cliGetValueHandler = new CliGetValueHandler(
      mockSpinner,
      mockCliService,
      mockStorageManager
    );

    // Reset mocks
    (createKeeperReference as jest.Mock).mockReset();
    (safeJsonParse as jest.Mock).mockReset();
  });

  describe('constructor', () => {
    it('should initialize with spinner, cliService and storageManager', () => {
      expect(cliGetValueHandler).toBeInstanceOf(CliGetValueHandler);
      const handler = new CliGetValueHandler(
        mockSpinner,
        mockCliService,
        mockStorageManager
      );
      expect(handler).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute successfully with records and fields', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
        { record_uid: 'record2', title: 'Record 2', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [
          { type: 'login', label: 'Username', value: ['user1'] },
          { type: 'password', label: 'Password', value: ['pass1'] },
        ],
        custom: [
          { type: 'text', label: 'Note', value: ['note1'] },
        ],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };
      const selectedField = { label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD };
      const keeperRef = 'keeper://record1/field/Username';

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(selectedField); // field selection
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGetValueHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(mockSpinner.show).toHaveBeenCalledWith(CLI_INFO_MESSAGES.RETRIEVING_SECRETS);
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('sync-down --force');
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('list', ['--format=json']);
      expect(mockCliService.executeCommanderCommand).toHaveBeenCalledWith('get', ['record1', '--format=json']);
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.SYNCING_DOWN_LATEST_RECORDS_FROM_VAULT)
      );
      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.RETRIEVED_RECORDS_FROM_VAULT)
      );
      expect(createKeeperReference).toHaveBeenCalledWith(
        'record1',
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'Username'
      );
      expect(mockActiveTextEditor.edit).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when CLI is not ready', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliGetValueHandler.execute();

      expect(mockCliService.isCLIReady).toHaveBeenCalled();
      expect(logger.logError).toHaveBeenCalledWith(
        'CliGetValueHandler: ' + CLI_LOGGER_ERROR_MESSAGES.CLI_NOT_READY
      );
      expect(mockSpinner.show).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should show no records message when no records found', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[]'); // list - empty
      (safeJsonParse as jest.Mock).mockReturnValueOnce([]); // empty records

      await cliGetValueHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.NO_RECORDS_FOUND)
      );
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        CLI_SUCCESS_MESSAGES.NO_RECORDS_FOUND
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when user cancels record selection', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)); // list
      (safeJsonParse as jest.Mock).mockReturnValueOnce(mockRecords);
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined); // user cancels

      await cliGetValueHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_RECORD_SELECTION)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should show no record data message when record data is empty', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce('[]'); // get - empty
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([]); // get response - empty
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(selectedRecord);

      await cliGetValueHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID)
      );
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        CLI_INFO_MESSAGES.NO_RECORD_DATA_FOUND_FOR_RECORD_UID + '- record1'
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should show no fields message when no fields available', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = { fields: [], custom: [] };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(selectedRecord);

      await cliGetValueHandler.execute();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        CLI_INFO_MESSAGES.NO_FIELDS_TO_SHOW
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should return early when user cancels field selection', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [{ type: 'login', label: 'Username', value: ['user1'] }],
        custom: [],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(undefined); // field selection - user cancels

      await cliGetValueHandler.execute();

      expect(logger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining(CLI_LOGGER_DEBUG_MESSAGES.USER_CANCELLED_FIELD_SELECTION)
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should throw error when createKeeperReference returns null', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [{ type: 'login', label: 'Username', value: ['user1'] }],
        custom: [],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };
      const selectedField = { label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD };

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(selectedField); // field selection
      (createKeeperReference as jest.Mock).mockReturnValue(null);

      await cliGetValueHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'CliGetValueHandler: ' +
          CLI_LOGGER_ERROR_MESSAGES.FAILED_TO_CREATE_KEEPER_REFERENCE +
          '- Record 1'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should not show success message when insert fails', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [{ type: 'login', label: 'Username', value: ['user1'] }],
        custom: [],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };
      const selectedField = { label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD };
      const keeperRef = 'keeper://record1/field/Username';

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(selectedField); // field selection
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = null; // No active editor

      await cliGetValueHandler.execute();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should handle errors during execution', async () => {
      const error = new Error('CLI command failed');

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand.mockRejectedValue(error);

      await cliGetValueHandler.execute();

      expect(logger.logError).toHaveBeenCalledWith(
        'CliGetValueHandler: ' + CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE,
        error
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        CLI_ERROR_MESSAGES.FAILED_TO_GET_VALUE
      );
      expect(mockSpinner.hide).toHaveBeenCalled();
    });

    it('should always hide spinner in finally block', async () => {
      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce('[]'); // list - empty
      (safeJsonParse as jest.Mock).mockReturnValueOnce([]);

      await cliGetValueHandler.execute();

      // hide is called once after listing (early-return path) and once in finally
      expect(mockSpinner.hide).toHaveBeenCalledTimes(2);
    });

    it('should hide spinner even when error occurs', async () => {
      mockCliService.isCLIReady.mockResolvedValue(false);

      await cliGetValueHandler.execute();

      expect(mockSpinner.hide).toHaveBeenCalledTimes(1);
    });

    it('should process both fields and custom fields', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [
          { type: 'login', label: 'Username', value: ['user1'] },
          { type: 'password', label: 'Password', value: ['pass1'] },
        ],
        custom: [
          { type: 'text', label: 'Note', value: ['note1'] },
          { type: 'oneTimeCode', label: 'OTP', value: ['123456'] },
        ],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };
      const selectedField = { label: 'Note', fieldType: KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD };
      const keeperRef = 'keeper://record1/custom_field/Note';

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(selectedField); // field selection
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGetValueHandler.execute();

      expect(createKeeperReference).toHaveBeenCalledWith(
        'record1',
        KEEPER_NOTATION_FIELD_TYPES.CUSTOM_FIELD,
        'Note'
      );
      expect(mockActiveTextEditor.edit).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalled();
    });

    it('should trim record value before creating keeper reference', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: [{ type: 'login', label: 'Username', value: ['user1'] }],
        custom: [],
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: '  record1  ' }; // With spaces
      const selectedField = { label: 'Username', fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD };
      const keeperRef = 'keeper://record1/field/Username';

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce(selectedRecord) // record selection
        .mockResolvedValueOnce(selectedField); // field selection
      (createKeeperReference as jest.Mock).mockReturnValue(keeperRef);
      (window.activeTextEditor as any) = mockActiveTextEditor;

      await cliGetValueHandler.execute();

      expect(createKeeperReference).toHaveBeenCalledWith(
        'record1', // Trimmed
        KEEPER_NOTATION_FIELD_TYPES.FIELD,
        'Username'
      );
    });

    it('should handle null/undefined fields and custom arrays', async () => {
      const mockRecords: ICliListRecordResponse[] = [
        { record_uid: 'record1', title: 'Record 1', record_category: CLI_RECORD_CATEGORY_CLASSIC },
      ];
      const mockRecordData = {
        fields: null,
        custom: undefined,
      };
      const selectedRecord: IRecordQuickPick = { label: 'Record 1', value: 'record1' };

      mockCliService.isCLIReady.mockResolvedValue(true);
      mockCliService.executeCommanderCommand
        .mockResolvedValueOnce('') // sync-down
        .mockResolvedValueOnce(JSON.stringify(mockRecords)) // list
        .mockResolvedValueOnce(JSON.stringify([mockRecordData])); // get
      (safeJsonParse as jest.Mock)
        .mockReturnValueOnce(mockRecords) // list response
        .mockReturnValueOnce([mockRecordData]); // get response
      (window.showQuickPick as jest.Mock).mockResolvedValueOnce(selectedRecord);

      await cliGetValueHandler.execute();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        CLI_INFO_MESSAGES.NO_FIELDS_TO_SHOW
      );
    });
  });
});
