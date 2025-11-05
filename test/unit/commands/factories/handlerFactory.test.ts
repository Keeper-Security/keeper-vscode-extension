import { ExtensionContext } from 'vscode';
import { HandlerFactory } from '../../../../src/commands/factories/handlerFactory';
import { CliService } from '../../../../src/services/cli';
import { KsmService } from '../../../../src/services/ksm';
import { ModeType } from '../../../../src/types';
import { StatusBarSpinner } from '../../../../src/utils/helper';
import { COMMANDS } from '../../../../src/utils/constants';
import { CliStorageManager } from '../../../../src/commands/storage/cliStorageManager';
import { KsmStorageManager } from '../../../../src/commands/storage/ksmStorageManager';
import { CliSaveValueHandler } from '../../../../src/commands/handlers/cli/cliSaveValueHandler';
import { CliGetValueHandler } from '../../../../src/commands/handlers/cli/cliGetValueHandler';
import { CliGeneratePasswordHandler } from '../../../../src/commands/handlers/cli/cliGeneratePasswordHandler';
import { CliRunSecurelyHandler } from '../../../../src/commands/handlers/cli/cliRunSecurelyHandler';
import { CliChooseFolderHandler } from '../../../../src/commands/handlers/cli/cliChooseFolderHandler';
import { CliOpenLogsHandler } from '../../../../src/commands/handlers/cli/cliOpenLogsHandler';
import { KsmSaveValueHandler } from '../../../../src/commands/handlers/ksm/ksmSaveValueHandler';
import { KsmGetValueHandler } from '../../../../src/commands/handlers/ksm/ksmGetValueHandler';
import { KsmGeneratePasswordHandler } from '../../../../src/commands/handlers/ksm/ksmGeneratePasswordHandler';
import { KsmRunSecurelyHandler } from '../../../../src/commands/handlers/ksm/ksmRunSecurelyHandler';
import { KsmChooseFolderHandler } from '../../../../src/commands/handlers/ksm/ksmChooseFolderHandler';
import { KsmOpenLogsHandler } from '../../../../src/commands/handlers/ksm/ksmOpenLogsHandler';
import { KsmAuthenticateHandler } from '../../../../src/commands/handlers/ksm/ksmAuthenticateHandler';
import { SwitchToKsmHandler } from '../../../../src/commands/handlers/cli/switchToKsmHandler';
import { SwitchToCliHandler } from '../../../../src/commands/handlers/ksm/switchToCliHandler';

// Mock all handler classes
jest.mock('../../../../src/commands/handlers/cli/cliSaveValueHandler');
jest.mock('../../../../src/commands/handlers/cli/cliGetValueHandler');
jest.mock('../../../../src/commands/handlers/cli/cliGeneratePasswordHandler');
jest.mock('../../../../src/commands/handlers/cli/cliRunSecurelyHandler');
jest.mock('../../../../src/commands/handlers/cli/cliChooseFolderHandler');
jest.mock('../../../../src/commands/handlers/cli/cliOpenLogsHandler');
jest.mock('../../../../src/commands/handlers/ksm/switchToCliHandler');
jest.mock('../../../../src/commands/handlers/cli/switchToKsmHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmSaveValueHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmGetValueHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmGeneratePasswordHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmRunSecurelyHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmChooseFolderHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmOpenLogsHandler');
jest.mock('../../../../src/commands/handlers/ksm/ksmAuthenticateHandler');

// Mock storage managers
jest.mock('../../../../src/commands/storage/cliStorageManager');
jest.mock('../../../../src/commands/storage/ksmStorageManager');

// Mock services
jest.mock('../../../../src/services/cli');
jest.mock('../../../../src/services/ksm');

describe('HandlerFactory', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockCliService: jest.Mocked<CliService>;
  let mockKsmService: jest.Mocked<KsmService>;
  let mockCliStorageManager: jest.Mocked<CliStorageManager>;
  let mockKsmStorageManager: jest.Mocked<KsmStorageManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as ExtensionContext;

    mockSpinner = {
      show: jest.fn(),
      updateMessage: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockCliService = {} as jest.Mocked<CliService>;
    mockKsmService = {} as jest.Mocked<KsmService>;

    mockCliStorageManager = {} as jest.Mocked<CliStorageManager>;
    mockKsmStorageManager = {} as jest.Mocked<KsmStorageManager>;

    // Mock CliStorageManager constructor
    (CliStorageManager as jest.MockedClass<typeof CliStorageManager>).mockImplementation(
      () => mockCliStorageManager
    );

    // Mock KsmStorageManager constructor
    (KsmStorageManager as jest.MockedClass<typeof KsmStorageManager>).mockImplementation(
      () => mockKsmStorageManager
    );
  });

  describe('createHandler - CLI Mode', () => {
    it('should create all CLI handlers when serviceMode is CLI', () => {
      const handlers = HandlerFactory.createHandler(
        ModeType.CLI,
        mockCliService,
        mockContext,
        mockSpinner
      );

      // Verify CliStorageManager was created with correct parameters
      expect(CliStorageManager).toHaveBeenCalledWith(
        mockContext,
        mockSpinner,
        mockCliService
      );

      // Verify all CLI handlers are created and mapped
      expect(handlers.size).toBe(7);
      expect(handlers.has(COMMANDS.SAVE_VALUE_TO_VAULT)).toBe(true);
      expect(handlers.has(COMMANDS.GET_VALUE_FROM_VAULT)).toBe(true);
      expect(handlers.has(COMMANDS.GENERATE_PASSWORD)).toBe(true);
      expect(handlers.has(COMMANDS.RUN_SECURELY)).toBe(true);
      expect(handlers.has(COMMANDS.CHOOSE_FOLDER)).toBe(true);
      expect(handlers.has(COMMANDS.OPEN_LOGS)).toBe(true);
      expect(handlers.has(COMMANDS.SWITCH_TO_KSM)).toBe(true);

      // Verify CliSaveValueHandler was created
      expect(CliSaveValueHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockCliService,
        mockCliStorageManager
      );

      // Verify CliGetValueHandler was created
      expect(CliGetValueHandler).toHaveBeenCalledWith(mockSpinner, mockCliService);

      // Verify CliGeneratePasswordHandler was created
      expect(CliGeneratePasswordHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockCliService,
        mockCliStorageManager
      );

      // Verify CliRunSecurelyHandler was created
      expect(CliRunSecurelyHandler).toHaveBeenCalledWith(
        mockContext,
        mockSpinner,
        mockCliService
      );

      // Verify CliChooseFolderHandler was created
      expect(CliChooseFolderHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockCliService,
        mockCliStorageManager
      );

      // Verify CliOpenLogsHandler was created
      expect(CliOpenLogsHandler).toHaveBeenCalledWith();

      // Verify SwitchToKsmHandler was created
      expect(SwitchToKsmHandler).toHaveBeenCalledWith(mockContext, mockCliStorageManager);
    });

    it('should return correct handler instances for CLI mode', () => {
      const handlers = HandlerFactory.createHandler(
        ModeType.CLI,
        mockCliService,
        mockContext,
        mockSpinner
      );

      // Verify handlers are instances of the expected classes
      expect(handlers.get(COMMANDS.SAVE_VALUE_TO_VAULT)).toBeInstanceOf(
        CliSaveValueHandler
      );
      expect(handlers.get(COMMANDS.GET_VALUE_FROM_VAULT)).toBeInstanceOf(
        CliGetValueHandler
      );
      expect(handlers.get(COMMANDS.GENERATE_PASSWORD)).toBeInstanceOf(
        CliGeneratePasswordHandler
      );
      expect(handlers.get(COMMANDS.RUN_SECURELY)).toBeInstanceOf(
        CliRunSecurelyHandler
      );
      expect(handlers.get(COMMANDS.CHOOSE_FOLDER)).toBeInstanceOf(
        CliChooseFolderHandler
      );
      expect(handlers.get(COMMANDS.OPEN_LOGS)).toBeInstanceOf(CliOpenLogsHandler);
      expect(handlers.get(COMMANDS.SWITCH_TO_KSM)).toBeInstanceOf(SwitchToKsmHandler);
    });

    it('should not create KSM handlers when in CLI mode', () => {
      HandlerFactory.createHandler(ModeType.CLI, mockCliService, mockContext, mockSpinner);

      // Verify KSM handlers were not created
      expect(KsmSaveValueHandler).not.toHaveBeenCalled();
      expect(KsmGetValueHandler).not.toHaveBeenCalled();
      expect(KsmGeneratePasswordHandler).not.toHaveBeenCalled();
      expect(KsmRunSecurelyHandler).not.toHaveBeenCalled();
      expect(KsmChooseFolderHandler).not.toHaveBeenCalled();
      expect(KsmOpenLogsHandler).not.toHaveBeenCalled();
      expect(KsmAuthenticateHandler).not.toHaveBeenCalled();
      expect(SwitchToCliHandler).not.toHaveBeenCalled();
      expect(KsmStorageManager).not.toHaveBeenCalled();
    });
  });

  describe('createHandler - KSM Mode', () => {
    it('should create all KSM handlers when serviceMode is KSM', () => {
      const handlers = HandlerFactory.createHandler(
        ModeType.KSM,
        mockKsmService,
        mockContext,
        mockSpinner
      );

      // Verify KsmStorageManager was created with correct parameters
      expect(KsmStorageManager).toHaveBeenCalledWith(
        mockContext,
        mockSpinner,
        mockKsmService
      );

      // Verify all KSM handlers are created and mapped
      expect(handlers.size).toBe(8);
      expect(handlers.has(COMMANDS.SAVE_VALUE_TO_VAULT)).toBe(true);
      expect(handlers.has(COMMANDS.GET_VALUE_FROM_VAULT)).toBe(true);
      expect(handlers.has(COMMANDS.GENERATE_PASSWORD)).toBe(true);
      expect(handlers.has(COMMANDS.RUN_SECURELY)).toBe(true);
      expect(handlers.has(COMMANDS.CHOOSE_FOLDER)).toBe(true);
      expect(handlers.has(COMMANDS.OPEN_LOGS)).toBe(true);
      expect(handlers.has(COMMANDS.SWITCH_TO_CLI)).toBe(true);
      expect(handlers.has(COMMANDS.AUTHENTICATE)).toBe(true);

      // Verify KsmSaveValueHandler was created
      expect(KsmSaveValueHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockKsmService,
        mockKsmStorageManager
      );

      // Verify KsmGetValueHandler was created
      expect(KsmGetValueHandler).toHaveBeenCalledWith(mockSpinner, mockKsmService);

      // Verify KsmGeneratePasswordHandler was created
      expect(KsmGeneratePasswordHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockKsmService,
        mockKsmStorageManager
      );

      // Verify KsmRunSecurelyHandler was created
      expect(KsmRunSecurelyHandler).toHaveBeenCalledWith(
        mockContext,
        mockSpinner,
        mockKsmService
      );

      // Verify KsmChooseFolderHandler was created
      expect(KsmChooseFolderHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockKsmService,
        mockKsmStorageManager
      );

      // Verify KsmOpenLogsHandler was created
      expect(KsmOpenLogsHandler).toHaveBeenCalledWith();

      // Verify SwitchToCliHandler was created
      expect(SwitchToCliHandler).toHaveBeenCalledWith(mockContext, mockKsmStorageManager);

      // Verify KsmAuthenticateHandler was created
      expect(KsmAuthenticateHandler).toHaveBeenCalledWith(
        mockSpinner,
        mockKsmService,
        mockKsmStorageManager
      );
    });

    it('should return correct handler instances for KSM mode', () => {
      const handlers = HandlerFactory.createHandler(
        ModeType.KSM,
        mockKsmService,
        mockContext,
        mockSpinner
      );

      // Verify handlers are instances of the expected classes
      expect(handlers.get(COMMANDS.SAVE_VALUE_TO_VAULT)).toBeInstanceOf(
        KsmSaveValueHandler
      );
      expect(handlers.get(COMMANDS.GET_VALUE_FROM_VAULT)).toBeInstanceOf(
        KsmGetValueHandler
      );
      expect(handlers.get(COMMANDS.GENERATE_PASSWORD)).toBeInstanceOf(
        KsmGeneratePasswordHandler
      );
      expect(handlers.get(COMMANDS.RUN_SECURELY)).toBeInstanceOf(
        KsmRunSecurelyHandler
      );
      expect(handlers.get(COMMANDS.CHOOSE_FOLDER)).toBeInstanceOf(
        KsmChooseFolderHandler
      );
      expect(handlers.get(COMMANDS.OPEN_LOGS)).toBeInstanceOf(KsmOpenLogsHandler);
      expect(handlers.get(COMMANDS.SWITCH_TO_CLI)).toBeInstanceOf(SwitchToCliHandler);
      expect(handlers.get(COMMANDS.AUTHENTICATE)).toBeInstanceOf(
        KsmAuthenticateHandler
      );
    });

    it('should not create CLI handlers when in KSM mode', () => {
      HandlerFactory.createHandler(ModeType.KSM, mockKsmService, mockContext, mockSpinner);

      // Verify CLI handlers were not created
      expect(CliSaveValueHandler).not.toHaveBeenCalled();
      expect(CliGetValueHandler).not.toHaveBeenCalled();
      expect(CliGeneratePasswordHandler).not.toHaveBeenCalled();
      expect(CliRunSecurelyHandler).not.toHaveBeenCalled();
      expect(CliChooseFolderHandler).not.toHaveBeenCalled();
      expect(CliOpenLogsHandler).not.toHaveBeenCalled();
      expect(SwitchToKsmHandler).not.toHaveBeenCalled();
      expect(CliStorageManager).not.toHaveBeenCalled();
    });
  });

  describe('createHandler - Edge Cases', () => {
    it('should create empty handlers map and return it (if serviceMode is neither CLI nor KSM)', () => {
      // This tests the implicit else branch where neither condition is met
      // Since ModeType is an enum with only CLI and KSM, this is theoretical
      // but ensures we handle unexpected values gracefully
      const handlers = HandlerFactory.createHandler(
        'invalid-mode' as any,
        mockCliService,
        mockContext,
        mockSpinner
      );

      // Should return empty map when mode doesn't match
      expect(handlers.size).toBe(0);
    });

    it('should create separate handler instances for each call', () => {
      const handlers1 = HandlerFactory.createHandler(
        ModeType.CLI,
        mockCliService,
        mockContext,
        mockSpinner
      );
      const handlers2 = HandlerFactory.createHandler(
        ModeType.CLI,
        mockCliService,
        mockContext,
        mockSpinner
      );

      // Verify that each call creates new instances
      expect(handlers1).not.toBe(handlers2);
      expect(handlers1.get(COMMANDS.SAVE_VALUE_TO_VAULT)).not.toBe(
        handlers2.get(COMMANDS.SAVE_VALUE_TO_VAULT)
      );
    });
  });

  describe('createHandler - Return Type', () => {
    it('should return a Map with string keys and ICommandHandler values', () => {
      const handlers = HandlerFactory.createHandler(
        ModeType.CLI,
        mockCliService,
        mockContext,
        mockSpinner
      );

      expect(handlers).toBeInstanceOf(Map);
      
      // Verify all keys are strings
      for (const key of handlers.keys()) {
        expect(typeof key).toBe('string');
      }

      // Verify all values are handler instances
      for (const handler of handlers.values()) {
        expect(handler).toBeDefined();
        expect(typeof handler).toBe('object');
      }
    });
  });
});
