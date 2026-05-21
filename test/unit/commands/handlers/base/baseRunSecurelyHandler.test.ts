import { ExtensionContext, window, workspace, Terminal } from 'vscode';
import { BaseRunSecurelyHandler } from '../../../../../src/commands/handlers/base/baseRunSecurelyHandler';
import { StatusBarSpinner } from '../../../../../src/utils/helper';
import { logger } from '../../../../../src/utils/logger';
import { BASE_HANDLER_MESSAGES, KEEPER_NOTATION_FIELD_TYPES } from '../../../../../src/utils/constants';
import { validateKeeperReference, parseKeeperReference, isEnvironmentFile } from '../../../../../src/utils/helper';
import { FieldExtractor } from '../../../../../src/commands/utils/fieldExtractor';
import { IRecordData } from '../../../../../src/types/ksm';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Mock dependencies
jest.mock('../../../../../src/utils/logger');
jest.mock('../../../../../src/utils/helper', () => ({
  ...jest.requireActual('../../../../../src/utils/helper'),
  validateKeeperReference: jest.fn(),
  parseKeeperReference: jest.fn(),
  isEnvironmentFile: jest.fn(),
  commonQuickPickOptions: {},
  commonInputBoxOptions: {},
}));
jest.mock('../../../../../src/commands/utils/fieldExtractor');
jest.mock('fs');
jest.mock('dotenv');
jest.mock('path');
jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    showOpenDialog: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    activeTextEditor: undefined,
    createTerminal: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
    })),
  },
  workspace: {
    workspaceFolders: undefined,
  },
}));

// Create a concrete implementation for testing
class TestRunSecurelyHandler extends BaseRunSecurelyHandler {
  async execute(): Promise<void> {
    // Test implementation
  }
}

describe('BaseRunSecurelyHandler', () => {
  let handler: TestRunSecurelyHandler;
  let mockContext: ExtensionContext;
  let mockSpinner: jest.Mocked<StatusBarSpinner>;
  let mockTerminal: jest.Mocked<Terminal>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as ExtensionContext;

    mockSpinner = {
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<StatusBarSpinner>;

    mockTerminal = {
      show: jest.fn(),
      sendText: jest.fn(),
    } as unknown as jest.Mocked<Terminal>;

    handler = new TestRunSecurelyHandler(mockContext, mockSpinner);
    (window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);
  });

  describe('executeRunSecurely', () => {
    it('should execute full flow successfully', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
      ];
      const command = 'node index.js';
      const mockFetchSecret = jest.fn().mockResolvedValue({} as IRecordData);

      (workspace.workspaceFolders as any) = mockWorkspaceFolders;
      (fs.readdirSync as jest.Mock).mockReturnValue(['.env']);
      (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true });
      (isEnvironmentFile as jest.Mock).mockReturnValue(true);
      (window.showQuickPick as jest.Mock).mockResolvedValue('.env');
      (window.showInputBox as jest.Mock).mockResolvedValue(command);
      (fs.readFileSync as jest.Mock).mockReturnValue('DB_PASSWORD=keeper://record123/field/password');
      (dotenv.parse as jest.Mock).mockReturnValue({ DB_PASSWORD: 'keeper://record123/field/password' });
      (validateKeeperReference as jest.Mock).mockReturnValue(true);
      (parseKeeperReference as jest.Mock).mockReturnValue({
        recordUid: 'record123',
        fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD,
        itemName: 'password',
      });
      (FieldExtractor.extractFieldValue as jest.Mock).mockReturnValue('secret123');
      (path.relative as jest.Mock).mockReturnValue('.env');
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

      await (handler as any).executeRunSecurely(mockFetchSecret);

      expect(mockSpinner.show).toHaveBeenCalledWith(BASE_HANDLER_MESSAGES.INFO.RESOLVING_SECRETS);
      expect(mockSpinner.hide).toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.INFO.COMMAND_STARTED_WITH_SECRETS_INJECTED
      );
      expect(window.createTerminal).toHaveBeenCalled();
      expect(mockTerminal.show).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalledWith(command, true);
    });

    it('should throw error when workspace selection fails', async () => {
      (workspace.workspaceFolders as any) = [];
      const mockFetchSecret = jest.fn();

      await expect((handler as any).executeRunSecurely(mockFetchSecret)).rejects.toThrow(
        BASE_HANDLER_MESSAGES.ERROR.OPEN_FOLDER_OR_WORKSPACE_FIRST
      );

      expect(mockFetchSecret).not.toHaveBeenCalled();
    });

    it('should return early when environment file selection is cancelled', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
      ];
      (workspace.workspaceFolders as any) = mockWorkspaceFolders;
      (fs.readdirSync as jest.Mock).mockReturnValue(['.env']);
      (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true });
      (isEnvironmentFile as jest.Mock).mockReturnValue(true);
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      (path.relative as jest.Mock).mockReturnValue('.env');

      const mockFetchSecret = jest.fn();
      await (handler as any).executeRunSecurely(mockFetchSecret);

      expect(mockFetchSecret).not.toHaveBeenCalled();
    });

    it('should return early when command input is cancelled', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
      ];
      (workspace.workspaceFolders as any) = mockWorkspaceFolders;
      (fs.readdirSync as jest.Mock).mockReturnValue(['.env']);
      (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true });
      (isEnvironmentFile as jest.Mock).mockReturnValue(true);
      (window.showQuickPick as jest.Mock).mockResolvedValue('.env');
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);
      (path.relative as jest.Mock).mockReturnValue('.env');

      const mockFetchSecret = jest.fn();
      await (handler as any).executeRunSecurely(mockFetchSecret);

      expect(mockFetchSecret).not.toHaveBeenCalled();
    });
  });

  describe('selectWorkspace', () => {
    it('should return workspace path when single workspace', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
      ];
      (workspace.workspaceFolders as any) = mockWorkspaceFolders;

      const result = await (handler as any).selectWorkspace();

      expect(result).toBe('/workspace1');
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should show picker when multiple workspaces', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
        { name: 'workspace2', uri: { fsPath: '/workspace2' } },
      ];
      (workspace.workspaceFolders as any) = mockWorkspaceFolders;
      (window.showQuickPick as jest.Mock).mockResolvedValue('workspace1');

      const result = await (handler as any).selectWorkspace();

      expect(window.showQuickPick).toHaveBeenCalled();
      expect(result).toBe('/workspace1');
    });

    it('should throw error when no workspaces', async () => {
      (workspace.workspaceFolders as any) = [];

      await expect((handler as any).selectWorkspace()).rejects.toThrow(
        BASE_HANDLER_MESSAGES.ERROR.OPEN_FOLDER_OR_WORKSPACE_FIRST
      );
    });

    it('should throw error when selected workspace not found', async () => {
      const mockWorkspaceFolders = [
        { name: 'workspace1', uri: { fsPath: '/workspace1' } },
        { name: 'workspace2', uri: { fsPath: '/workspace2' } },
      ];
      (workspace.workspaceFolders as any) = mockWorkspaceFolders;
      (window.showQuickPick as jest.Mock).mockResolvedValue('nonexistent');

      await expect((handler as any).selectWorkspace()).rejects.toThrow(
        BASE_HANDLER_MESSAGES.ERROR.WORKSPACE_NOT_FOUND
      );
    });
  });

  describe('selectEnvironmentFile', () => {
    it('should return selected environment file', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue(['.env', '.env.local']);
      (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true });
      (isEnvironmentFile as jest.Mock).mockReturnValue(true);
      (window.showQuickPick as jest.Mock).mockResolvedValue('.env');
      (path.relative as jest.Mock).mockReturnValue('.env');
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

      const result = await (handler as any).selectEnvironmentFile('/workspace');

      expect(result).toBe('/workspace/.env');
    });

    it('should handle browse option', async () => {
      const mockUri = { fsPath: '/workspace/.env.custom' };
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (window.showQuickPick as jest.Mock).mockResolvedValue('$(folder-opened) Browse Environment File');
      (window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      (path.basename as jest.Mock).mockReturnValue('.env.custom');
      (isEnvironmentFile as jest.Mock).mockReturnValue(true);

      const result = await (handler as any).selectEnvironmentFile('/workspace');

      expect(result).toBe('/workspace/.env.custom');
    });

    it('should throw error when browsed file is not environment file', async () => {
      const mockUri = { fsPath: '/workspace/file.txt' };
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (window.showQuickPick as jest.Mock).mockResolvedValue('$(folder-opened) Browse Environment File');
      (window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      (path.basename as jest.Mock).mockReturnValue('file.txt');
      (isEnvironmentFile as jest.Mock).mockReturnValue(false);

      await expect((handler as any).selectEnvironmentFile('/workspace')).rejects.toThrow(
        BASE_HANDLER_MESSAGES.ERROR.SELECTED_FILE_IS_NOT_AN_ENVIRONMENT_FILE
      );
    });
  });

  describe('getCommandFromUser', () => {
    it('should return command from user', async () => {
      const lastCommand = 'npm start';
      const newCommand = 'npm test';
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(lastCommand);
      (window.showInputBox as jest.Mock).mockResolvedValue(newCommand);

      const result = await (handler as any).getCommandFromUser();

      expect(result).toBe(newCommand);
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        expect.any(String),
        newCommand
      );
    });

    it('should use last command as default value', async () => {
      const lastCommand = 'npm start';
      (mockContext.workspaceState.get as jest.Mock).mockReturnValue(lastCommand);
      (window.showInputBox as jest.Mock).mockResolvedValue('npm test');

      await (handler as any).getCommandFromUser();

      expect(window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({
          value: lastCommand,
        })
      );
    });

    it('should return undefined when user cancels', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await (handler as any).getCommandFromUser();

      expect(result).toBeUndefined();
    });
  });

  describe('resolveSecrets', () => {
    it('should resolve keeper references', async () => {
      const envContent = 'DB_PASSWORD=keeper://record123/field/password';
      (fs.readFileSync as jest.Mock).mockReturnValue(envContent);
      (dotenv.parse as jest.Mock).mockReturnValue({
        DB_PASSWORD: 'keeper://record123/field/password',
      });
      (validateKeeperReference as jest.Mock).mockReturnValue(true);
      (parseKeeperReference as jest.Mock).mockReturnValue({
        recordUid: 'record123',
        fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD,
        itemName: 'password',
      });
      const mockRecordData = {} as IRecordData;
      (FieldExtractor.extractFieldValue as jest.Mock).mockReturnValue('secret123');
      const mockFetchSecret = jest.fn().mockResolvedValue(mockRecordData);

      const result = await (handler as any).resolveSecrets('/workspace/.env', mockFetchSecret);

      expect(result.DB_PASSWORD).toBe('secret123');
      expect(mockFetchSecret).toHaveBeenCalledWith('record123');
    });

    it('should keep non-keeper references as-is', async () => {
      const envContent = 'PORT=3000\nDB_HOST=localhost';
      (fs.readFileSync as jest.Mock).mockReturnValue(envContent);
      (dotenv.parse as jest.Mock).mockReturnValue({
        PORT: '3000',
        DB_HOST: 'localhost',
      });
      (validateKeeperReference as jest.Mock).mockReturnValue(false);
      const mockFetchSecret = jest.fn();

      const result = await (handler as any).resolveSecrets('/workspace/.env', mockFetchSecret);

      expect(result.PORT).toBe('3000');
      expect(result.DB_HOST).toBe('localhost');
      expect(mockFetchSecret).not.toHaveBeenCalled();
    });

    it('should handle parsing errors', async () => {
      const envContent = 'DB_PASSWORD=keeper://invalid';
      (fs.readFileSync as jest.Mock).mockReturnValue(envContent);
      (dotenv.parse as jest.Mock).mockReturnValue({
        DB_PASSWORD: 'keeper://invalid',
      });
      (validateKeeperReference as jest.Mock).mockReturnValue(true);
      (parseKeeperReference as jest.Mock).mockReturnValue(null);
      const mockFetchSecret = jest.fn();

      await (handler as any).resolveSecrets('/workspace/.env', mockFetchSecret);

      expect(logger.logError).toHaveBeenCalled();
      expect(mockFetchSecret).not.toHaveBeenCalled();
    });

    it('should reject keeper references with control characters in .env', async () => {
      const maliciousValue = 'keeper://abc\nksm.bat\n/field/password';
      (fs.readFileSync as jest.Mock).mockReturnValue(
        `API_PASSWORD="${maliciousValue}"`
      );
      (dotenv.parse as jest.Mock).mockReturnValue({
        API_PASSWORD: maliciousValue,
      });
      const mockFetchSecret = jest.fn();

      await expect(
        (handler as any).resolveSecrets('/workspace/.env', mockFetchSecret)
      ).rejects.toThrow(/control character/i);

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        BASE_HANDLER_MESSAGES.ERROR.INVALID_KEEPER_REFERENCE_IN_ENV
      );
      expect(mockFetchSecret).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      const envContent = 'DB_PASSWORD=keeper://record123/field/password';
      (fs.readFileSync as jest.Mock).mockReturnValue(envContent);
      (dotenv.parse as jest.Mock).mockReturnValue({
        DB_PASSWORD: 'keeper://record123/field/password',
      });
      (validateKeeperReference as jest.Mock).mockReturnValue(true);
      (parseKeeperReference as jest.Mock).mockReturnValue({
        recordUid: 'record123',
        fieldType: KEEPER_NOTATION_FIELD_TYPES.FIELD,
        itemName: 'password',
      });
      const mockFetchSecret = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      const result = await (handler as any).resolveSecrets('/workspace/.env', mockFetchSecret);

      expect(result.DB_PASSWORD).toContain('error');
      expect(logger.logError).toHaveBeenCalled();
    });
  });
});
