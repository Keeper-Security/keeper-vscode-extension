import {
  buildRecordAddArgs,
  resolveRecordAddCommand,
  RECORD_ADD_COMMANDS,
} from '../../../../src/commands/utils/cliRecordCommandResolver';
import {
  escapeCommanderDoubleQuotedValue,
  serializeCommanderShellCommand,
} from '../../../../src/utils/helper';
import { KEEPER_RECORD_TYPES } from '../../../../src/utils/constants';
import { CLI_ERROR_MESSAGES } from '../../../../src/utils/cli-messages';
import { window } from 'vscode';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    showQuickPick: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    })),
  },
}));

describe('cliRecordCommandResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildRecordAddArgs', () => {
    it('should build classic record-add args with quoted field value', () => {
      const args = buildRecordAddArgs({
        title: 'My Record',
        recordType: KEEPER_RECORD_TYPES.LOGIN,
        fieldKey: 'c.secret.password',
        fieldValue: { kind: 'literal', value: 'secret-value' },
      });

      expect(args).toEqual([
        '--title="My Record"',
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        '"c.secret.password"="secret-value"',
      ]);
    });

    it('should include folder arg when folderUid is not root', () => {
      const args = buildRecordAddArgs({
        title: 'My Record',
        recordType: KEEPER_RECORD_TYPES.LOGIN,
        fieldKey: 'c.secret.apiKey',
        fieldValue: { kind: 'literal', value: 'secret-value' },
        folderUid: 'folder123',
      });

      expect(args).toContain('--folder="folder123"');
    });

    it('should build generate-password field assignment without quoting $GEN', () => {
      const args = buildRecordAddArgs({
        title: 'Generated',
        recordType: KEEPER_RECORD_TYPES.LOGIN,
        fieldKey: 'password',
        fieldValue: { kind: 'generate', token: '$GEN' },
      });

      expect(args).toEqual([
        '--title="Generated"',
        `--record-type=${KEEPER_RECORD_TYPES.LOGIN}`,
        '"password"=$GEN',
      ]);
    });

    it('should escape quote-breakout payloads in field values (Save-to-Vault PoC)', () => {
      const maliciousValue = 'SAFE_VALUE" --title="SAFE_INJECTED';
      const args = buildRecordAddArgs({
        title: 'SAFE_ORIGINAL',
        recordType: KEEPER_RECORD_TYPES.LOGIN,
        fieldKey: 'c.secret.password',
        fieldValue: { kind: 'literal', value: maliciousValue },
      });

      expect(args[2]).toBe(
        `"c.secret.password"="${escapeCommanderDoubleQuotedValue(maliciousValue)}"`
      );

      const shellLine = serializeCommanderShellCommand('record-add', args);

      // Must not contain an unescaped second --title flag outside field data.
      expect(shellLine).not.toMatch(
        /"c\.secret\.password"="SAFE_VALUE" --title="SAFE_INJECTED"/
      );
      expect(shellLine).toContain('SAFE_VALUE\\" --title=\\"SAFE_INJECTED');
    });

    it('should escape quote-breakout payloads in record title', () => {
      const maliciousTitle = 'SAFE_ORIGINAL" --title="SAFE_INJECTED';
      const args = buildRecordAddArgs({
        title: maliciousTitle,
        recordType: KEEPER_RECORD_TYPES.LOGIN,
        fieldKey: 'c.secret.password',
        fieldValue: { kind: 'literal', value: 'secret-value' },
      });

      expect(args[0]).toBe(
        `--title="${escapeCommanderDoubleQuotedValue(maliciousTitle)}"`
      );

      const shellLine = serializeCommanderShellCommand('record-add', args);
      expect(shellLine).not.toMatch(
        /--title="SAFE_ORIGINAL" --title="SAFE_INJECTED"/
      );
    });

    it('should reject control characters in field values', () => {
      expect(() =>
        buildRecordAddArgs({
          title: 'My Record',
          recordType: KEEPER_RECORD_TYPES.LOGIN,
          fieldKey: 'c.secret.password',
          fieldValue: { kind: 'literal', value: 'bad\nvalue' },
        })
      ).toThrow(CLI_ERROR_MESSAGES.INVALID_COMMANDER_RECORD_ADD_VALUE);
    });
  });

  describe('resolveRecordAddCommand', () => {
    it('should prompt for permission model when storage is My Vault', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Use classic permission model',
        value: RECORD_ADD_COMMANDS.CLASSIC,
      });

      const result = await resolveRecordAddCommand({
        folderUid: '/',
        name: 'My Vault',
        parentUid: '/',
        folderPath: '/',
        source: '',
      });

      expect(result).toBe(RECORD_ADD_COMMANDS.CLASSIC);
      expect(window.showQuickPick).toHaveBeenCalled();
    });
  });
});
