import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Test Suite', () => {
  vscode.window.showInformationMessage('Start integration tests.');

  test('Extension should activate', async () => {
    // Test that extension activates without errors
    const extension = vscode.extensions.getExtension('keeper-security.ks-vscode');
    assert.ok(extension);
  });

  test('Hello World command should be registered', async () => {
    // Test that our command is available
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('ks-vscode.helloWorld'));
  });

  test('Hello World command should execute', async () => {
    // Test that command can be executed
    try {
      await vscode.commands.executeCommand('ks-vscode.helloWorld');
      // If we get here, command executed successfully
      assert.ok(true);
    } catch (error) {
      assert.fail(`Command execution failed: ${error}`);
    }
  });

  test('Extension should show information message', async () => {
    // Test the actual functionality
    const showInformationMessage = vscode.window.showInformationMessage;
    let messageShown = false;
    
    // Mock the showInformationMessage to capture the call
    vscode.window.showInformationMessage = (message: string) => {
      messageShown = true;
      assert.strictEqual(message, 'Hello World from Keeper Security!');
      return Promise.resolve(undefined);
    };

    try {
      await vscode.commands.executeCommand('ks-vscode.helloWorld');
      assert.ok(messageShown, 'Information message should have been shown');
    } finally {
      // Restore original function
      vscode.window.showInformationMessage = showInformationMessage;
    }
  });
}); 