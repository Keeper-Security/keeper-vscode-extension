import { Core } from '../../../src/services/core';
import { CommandService } from '../../../src/commands';
import { SecretDetectionService } from '../../../src/services/secretDetection';
import { ModeManager } from '../../../src/services/managers/modeManager';
import { ServiceManager } from '../../../src/services/managers/serviceManager';
import { StatusBarSpinner } from '../../../src/utils/helper';
import { logger } from '../../../src/utils/logger';
import { ModeType } from '../../../src/types';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('../../../src/services/managers/modeManager');
jest.mock('../../../src/services/managers/serviceManager');
jest.mock('../../../src/commands');
jest.mock('../../../src/services/secretDetection');
jest.mock('../../../src/utils/helper');
jest.mock('../../../src/utils/logger');

describe('Core', () => {
  let mockContext: vscode.ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockServiceManager: jest.Mocked<ServiceManager>;
  let mockService: { dispose: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      subscriptions: [],
      extensionPath: '/mock/extension/path',
      globalState: { get: jest.fn(), update: jest.fn() },
      workspaceState: { get: jest.fn(), update: jest.fn() }
    } as unknown as vscode.ExtensionContext;

    mockService = {
      dispose: jest.fn(),
    };

    mockServiceManager = {
      getCurrentService: jest.fn().mockReturnValue(mockService),
      getCurrentMode: jest.fn(),
    } as unknown as jest.Mocked<ServiceManager>;

    mockSpinner = {
      dispose: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    (StatusBarSpinner as jest.MockedClass<typeof StatusBarSpinner>).mockImplementation(() => mockSpinner);
    (ServiceManager as jest.MockedClass<typeof ServiceManager>).mockImplementation(() => mockServiceManager);
    (CommandService as jest.MockedClass<typeof CommandService>).mockImplementation(() => ({} as CommandService));
    (SecretDetectionService as jest.MockedClass<typeof SecretDetectionService>).mockImplementation(() => ({} as SecretDetectionService));
    
    // Default: mode exists
    (ModeManager.getCurrentMode as jest.Mock).mockReturnValue(ModeType.CLI);
  });

  describe('constructor', () => {
    it('should initialize core service successfully when mode exists', () => {
      new Core(mockContext);
      
      expect(StatusBarSpinner).toHaveBeenCalled();
      expect(ModeManager.getCurrentMode).toHaveBeenCalled();
      expect(ServiceManager).toHaveBeenCalledWith(mockContext, mockSpinner, ModeType.CLI);
      expect(CommandService).toHaveBeenCalledWith(mockContext, mockServiceManager, mockSpinner);
      expect(SecretDetectionService).toHaveBeenCalledWith(mockContext);
      expect(mockContext.subscriptions).toHaveLength(1);
      expect(logger.logDebug).toHaveBeenCalledWith('Initializing Core service');
    });

    it('should prompt for mode selection when mode does not exist', async () => {
      (ModeManager.getCurrentMode as jest.Mock).mockReturnValue(undefined);
      (ModeManager.promptForModeSelection as jest.Mock).mockResolvedValue(ModeType.KSM);
      (ModeManager.setMode as jest.Mock).mockResolvedValue(undefined);

      // Core constructor calls initializeServices which is async but not awaited
      // We need to wait for the async operation
      new Core(mockContext);
      
      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(ModeManager.getCurrentMode).toHaveBeenCalled();
      expect(ModeManager.promptForModeSelection).toHaveBeenCalled();
      expect(ModeManager.setMode).toHaveBeenCalledWith(ModeType.KSM);
      expect(ServiceManager).toHaveBeenCalledWith(mockContext, mockSpinner, ModeType.KSM);
    });

    it('should register disposal handler', () => {
      new Core(mockContext);
      
      expect(mockContext.subscriptions).toHaveLength(1);
      const subscription = mockContext.subscriptions[0];
      expect(subscription.dispose).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources when called', () => {
      new Core(mockContext);
      
      // Get the disposal handler
      const subscription = mockContext.subscriptions[0];
      subscription.dispose();
      
      expect(mockServiceManager.getCurrentService).toHaveBeenCalled();
      expect(mockService.dispose).toHaveBeenCalled();
      expect(mockSpinner.dispose).toHaveBeenCalled();
      expect(logger.logDebug).toHaveBeenCalledWith('Disposing Core service resources');
      expect(logger.logDebug).toHaveBeenCalledWith('Core service disposal completed');
    });
  });
}); 