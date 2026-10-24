import { describe, expect, it } from 'vitest';
import type { TauViewerIssue } from '@taucad/mcp/viewer-protocol';
import { issueChatText } from '#app/page-issues.jsx';

const syntaxError: TauViewerIssue = {
  message: 'Unexpected token',
  code: 'BUNDLER_FAILED',
  severity: 'error',
  location: { fileName: '/main.ts', startLineNumber: 3, startColumn: 7 },
};
const warning: TauViewerIssue = { message: 'Display simplified', code: 'DISPLAY_SIMPLIFIED', severity: 'warning' };

describe('issueChatText', () => {
  it('should name the source and list one issue as desktop Fix with AI does', () => {
    expect(issueChatText([syntaxError], 'main.ts')).toBe(
      'Fix this issue in main.ts:\n\n- **Message:** Unexpected token\n- **Location:** Line 3, Column 7',
    );
  });

  it('should count several issues and leave out a source it does not know', () => {
    expect(issueChatText([syntaxError, warning], undefined)).toBe(
      [
        'Fix these 2 issues:',
        '- **Message:** Unexpected token\n- **Location:** Line 3, Column 7',
        '- **Message:** Display simplified\n- **Location:** Unknown location',
      ].join('\n\n'),
    );
  });
});
