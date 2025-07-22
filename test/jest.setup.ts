// Global Jest setup for VS Code extension tests
jest.mock('vscode');

beforeEach(() => {
  jest.clearAllMocks();
}); 