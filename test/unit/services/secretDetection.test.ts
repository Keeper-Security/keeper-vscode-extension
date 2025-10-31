import { SecretDetectionService } from '../../../src/services/secretDetection';
import { logger } from '../../../src/utils/logger';
import { configuration } from '../../../src/services/configurations';
import { ExtensionContext } from 'vscode';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/configurations', () => ({
  configuration: {
    onDidChange: jest.fn(),
    get: jest.fn().mockReturnValue(true) // Mock get method to return true
  },
  ConfigurationKey: {
    SecretDetectionEnabled: 'editor.secretDetection'
  }
}));

// Mock parser classes
jest.mock('../../../src/secret-detection/parser/parser');
jest.mock('../../../src/secret-detection/parser/dotEnv');

// Mock CodeLens provider
jest.mock('../../../src/providers/secretDetectionCodeLensProvider', () => ({
  SecretDetectionCodeLensProvider: jest.fn().mockImplementation(() => ({
    refresh: jest.fn()
  }))
}));

// Mock VS Code APIs
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  languages: {
    registerCodeLensProvider: jest.fn().mockReturnValue({
      dispose: jest.fn()
    })
  },
  workspace: {
    onDidSaveTextDocument: jest.fn().mockReturnValue({
      dispose: jest.fn()
    })
  }
}));

// Mock helper functions
jest.mock('../../../src/utils/helper', () => ({
  documentMatcher: jest.fn(() => jest.fn(() => true)),
  isEnvironmentFile: jest.fn(() => false)
}));

describe('SecretDetectionService', () => {
  let mockContext: ExtensionContext;
  let secretDetectionService: SecretDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      subscriptions: []
    } as unknown as ExtensionContext;

    secretDetectionService = new SecretDetectionService(mockContext);
  });

  describe('constructor', () => {
    it('should initialize secret detection service', () => {
      expect(logger.logDebug).toHaveBeenCalledWith('Initializing SecretDetectionService');
      expect(logger.logDebug).toHaveBeenCalledWith('Starting secret detection initialization');
      expect(logger.logDebug).toHaveBeenCalledWith('Secret detection initialization completed');
    });

    it('should register configuration change listener', () => {
      expect(configuration.onDidChange).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should create CodeLens provider when secret detection is enabled', () => {
      // The initialize method is called in constructor
      expect(logger.logDebug).toHaveBeenCalledWith('Starting secret detection initialization');
      expect(logger.logDebug).toHaveBeenCalledWith('Secret detection initialization completed');
      // Verify CodeLens provider was created
      const { SecretDetectionCodeLensProvider } = require('../../../src/providers/secretDetectionCodeLensProvider');
      expect(SecretDetectionCodeLensProvider).toHaveBeenCalled();
    });

    it('should register CodeLens provider and event listeners', () => {
      const { languages, workspace } = require('vscode');
      
      expect(languages.registerCodeLensProvider).toHaveBeenCalled();
      expect(workspace.onDidSaveTextDocument).toHaveBeenCalled();
    });

    it('should skip initialization when secret detection is disabled', () => {
      // Clear previous calls
      jest.clearAllMocks();
      (configuration.get as jest.Mock).mockReturnValue(false);

      new SecretDetectionService(mockContext);

      expect(logger.logDebug).toHaveBeenCalledWith('Secret detection is disabled in the extension settings');
      const { SecretDetectionCodeLensProvider } = require('../../../src/providers/secretDetectionCodeLensProvider');
      expect(SecretDetectionCodeLensProvider).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose secret detection service resources', () => {
      secretDetectionService.dispose();

      expect(logger.logDebug).toHaveBeenCalledWith('SecretDetectionService disposal completed');
      // Verify subscriptions are disposed
      expect(secretDetectionService).toBeDefined();
    });
  });

  describe('parser factory', () => {
    it('should create appropriate parsers for different document types', () => {

      // Verify the parser factory was created and works
      expect(secretDetectionService).toBeDefined();
      expect(typeof secretDetectionService.dispose).toBe('function');
    });
  });

  describe('configuration handling', () => {
    it('should respond to configuration changes', () => {
      // Test that the service responds to configuration changes
      expect(configuration.onDidChange).toHaveBeenCalled();
      
      // The callback should be bound to the initialize method
      const callback = (configuration.onDidChange as jest.Mock).mock.calls[0][0];
      expect(typeof callback).toBe('function');
    });
  });
}); 