import { activate } from '../src/extension';
import * as vscode from 'vscode';

describe('Extension', () => {
  const mockContext = {
    subscriptions: [],
    extensionPath: '/mock/extension/path',
    globalState: { get: jest.fn(), update: jest.fn() },
    workspaceState: { get: jest.fn(), update: jest.fn() }
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should activate successfully', () => {
    activate(mockContext);
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
  });

  test('should register helloWorld command', () => {
    activate(mockContext);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ks-vscode.helloWorld',
      expect.any(Function)
    );
  });

  test('should show information message when command is executed', () => {
    activate(mockContext);
    
    // Get the registered command function
    const registerCommandCall = (vscode.commands.registerCommand as jest.Mock).mock.calls[0];
    const commandId = registerCommandCall[0];
    const commandFunction = registerCommandCall[1];
    
    expect(commandId).toBe('ks-vscode.helloWorld');
    
    // Execute the command function
    commandFunction();
    
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Hello World from Keeper Security!'
    );
  });
}); 