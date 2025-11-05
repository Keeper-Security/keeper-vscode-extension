import { ExtensionContext } from 'vscode';
import { ServiceManager } from '../../../../src/services/managers/serviceManager';
import { CliService } from '../../../../src/services/cli';
import { KsmService } from '../../../../src/services/ksm';
import { Mode, ModeType } from '../../../../src/types';
import { StatusBarSpinner } from '../../../../src/utils/helper';

// Mock dependencies
jest.mock('../../../../src/services/cli');
jest.mock('../../../../src/services/ksm');
jest.mock('../../../../src/utils/helper', () => ({
  StatusBarSpinner: jest.fn(),
}));

describe('ServiceManager', () => {
  let mockContext: ExtensionContext;
  let mockSpinner: StatusBarSpinner;
  let mockCliService: jest.Mocked<CliService>;
  let mockKsmService: jest.Mocked<KsmService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ExtensionContext
    mockContext = {
      subscriptions: [],
    } as unknown as ExtensionContext;

    // Mock StatusBarSpinner
    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
    } as unknown as StatusBarSpinner;

    // Mock CliService
    mockCliService = {} as jest.Mocked<CliService>;
    (CliService as jest.MockedClass<typeof CliService>).mockImplementation(
      () => mockCliService
    );

    // Mock KsmService
    mockKsmService = {} as jest.Mocked<KsmService>;
    (KsmService as jest.MockedClass<typeof KsmService>).mockImplementation(
      () => mockKsmService
    );
  });

  describe('constructor', () => {
    it('should initialize with CLI mode and create CliService', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      expect(CliService).toHaveBeenCalledWith(mockContext, mockSpinner);
      expect(KsmService).not.toHaveBeenCalled();
      expect(serviceManager.getCurrentMode()).toBe(ModeType.CLI);
    });

    it('should initialize with KSM mode and create KsmService', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      expect(KsmService).toHaveBeenCalledWith(mockContext, mockSpinner);
      expect(CliService).not.toHaveBeenCalled();
      expect(serviceManager.getCurrentMode()).toBe(ModeType.KSM);
    });

    it('should throw error for invalid mode', () => {
      const invalidMode = 'invalid' as Mode;

      expect(() => {
        new ServiceManager(mockContext, mockSpinner, invalidMode);
      }).toThrow('Invalid mode');
    });

    it('should set currentMode correctly', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      expect(serviceManager.getCurrentMode()).toBe(ModeType.CLI);
    });

    it('should initialize services during construction', () => {
      new ServiceManager(mockContext, mockSpinner, ModeType.CLI);

      expect(CliService).toHaveBeenCalledTimes(1);
      expect(CliService).toHaveBeenCalledWith(mockContext, mockSpinner);
    });
  });

  describe('getCurrentService', () => {
    it('should return CliService when mode is CLI and service exists', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      const service = serviceManager.getCurrentService();

      expect(service).toBe(mockCliService);
      // Removed toBeInstanceOf check as mocked classes don't work with instanceof
    });

    it('should return KsmService when mode is KSM and service exists', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      const service = serviceManager.getCurrentService();

      expect(service).toBe(mockKsmService);
      // Removed toBeInstanceOf check as mocked classes don't work with instanceof
    });

    it('should throw error when CLI mode but cliService is undefined', () => {
      // Create a service manager but manually set cliService to undefined
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      // Access private property to simulate cliService being undefined
      // This tests the else branch in getCurrentService
      (serviceManager as any).cliService = undefined;

      expect(() => {
        serviceManager.getCurrentService();
      }).toThrow('No service found for current mode');
    });

    it('should throw error when KSM mode but ksmService is undefined', () => {
      // Create a service manager but manually set ksmService to undefined
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      // Access private property to simulate ksmService being undefined
      // This tests the else branch in getCurrentService
      (serviceManager as any).ksmService = undefined;

      expect(() => {
        serviceManager.getCurrentService();
      }).toThrow('No service found for current mode');
    });
  });

  describe('getCurrentMode', () => {
    it('should return CLI mode when initialized with CLI', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      expect(serviceManager.getCurrentMode()).toBe(ModeType.CLI);
    });

    it('should return KSM mode when initialized with KSM', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      expect(serviceManager.getCurrentMode()).toBe(ModeType.KSM);
    });

    it('should return the same mode throughout service lifecycle', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      const mode1 = serviceManager.getCurrentMode();
      const mode2 = serviceManager.getCurrentMode();
      const mode3 = serviceManager.getCurrentMode();

      expect(mode1).toBe(ModeType.CLI);
      expect(mode2).toBe(ModeType.CLI);
      expect(mode3).toBe(ModeType.CLI);
      expect(mode1).toBe(mode2);
      expect(mode2).toBe(mode3);
    });
  });

  describe('integration scenarios', () => {
    it('should get CLI service after initialization with CLI mode', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      const service = serviceManager.getCurrentService();

      expect(service).toBe(mockCliService);
      expect(serviceManager.getCurrentMode()).toBe(ModeType.CLI);
    });

    it('should get KSM service after initialization with KSM mode', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      const service = serviceManager.getCurrentService();

      expect(service).toBe(mockKsmService);
      expect(serviceManager.getCurrentMode()).toBe(ModeType.KSM);
    });

    it('should maintain mode consistency between getCurrentMode and getCurrentService', () => {
      const serviceManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );

      const mode = serviceManager.getCurrentMode();
      const service = serviceManager.getCurrentService();

      expect(mode).toBe(ModeType.CLI);
      expect(service).toBe(mockCliService);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple service manager instances with different modes', () => {
      const cliManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.CLI
      );
      const ksmManager = new ServiceManager(
        mockContext,
        mockSpinner,
        ModeType.KSM
      );

      expect(cliManager.getCurrentMode()).toBe(ModeType.CLI);
      expect(ksmManager.getCurrentMode()).toBe(ModeType.KSM);
      expect(cliManager.getCurrentService()).toBe(mockCliService);
      expect(ksmManager.getCurrentService()).toBe(mockKsmService);
    });
  });
});
