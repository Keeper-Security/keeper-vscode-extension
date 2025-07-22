// Comprehensive VS Code API mock for Jest testing
export const window = {
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  showQuickPick: jest.fn().mockResolvedValue(undefined),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    clear: jest.fn()
  })),
  activeTextEditor: undefined,
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: jest.fn(),
  onDidChangeWindowState: jest.fn(),
  onDidChangeTextEditorSelection: jest.fn(),
  onDidChangeTextEditorVisibleRanges: jest.fn(),
  onDidChangeTextEditorOptions: jest.fn(),
  onDidChangeTextEditorViewColumn: jest.fn(),
  onDidCloseTerminal: jest.fn(),
  onDidOpenTerminal: jest.fn(),
  onDidChangeTerminalDimensions: jest.fn(),
  onDidChangeTerminalState: jest.fn(),
  onDidChangeActiveColorTheme: jest.fn(),
  onDidChangeFileIconTheme: jest.fn(),
  onDidChangeProductIconTheme: jest.fn(),
  onDidChangeWorkspaceFolders: jest.fn(),
  onDidChangeConfiguration: jest.fn(),
  onDidChangeTextDocument: jest.fn(),
  onDidCloseTextDocument: jest.fn(),
  onDidOpenTextDocument: jest.fn(),
  onDidSaveTextDocument: jest.fn(),
  onDidChangeVisibleTextEditors: jest.fn()
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn()
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn()
  })),
  onDidChangeConfiguration: jest.fn(),
  workspaceFolders: [],
  onDidChangeWorkspaceFolders: jest.fn()
};

export const ExtensionContext = jest.fn();
export const Uri = {
  file: jest.fn(),
  parse: jest.fn()
};

export default {
  window,
  commands,
  workspace,
  ExtensionContext,
  Uri
}; 