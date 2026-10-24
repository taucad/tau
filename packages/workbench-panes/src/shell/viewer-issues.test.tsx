import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { formatViewerIssue, unpreparedKernelOf, ViewerIssues } from '#shell/viewer-issues.jsx';
import type { KernelIssue } from '@taucad/runtime';
import type { ViewerIssuesProps } from '#shell/viewer-issues.jsx';

const syntaxError: KernelIssue = {
  message: 'Unexpected token',
  code: 'BUNDLER_FAILED',
  severity: 'error',
  location: { fileName: '/src/main.ts', startLineNumber: 3, startColumn: 7 },
  stackFrames: [
    { functionName: 'main', fileName: '/src/main.ts', lineNumber: 3, columnNumber: 7, context: 'user' },
    { functionName: 'evaluate', fileName: 'worker.js', lineNumber: 1, columnNumber: 2, context: 'runtime' },
  ],
};
const warning: KernelIssue = { message: 'Display simplified', code: 'DISPLAY_SIMPLIFIED', severity: 'warning' };
const note: KernelIssue = { message: 'Cached', code: 'UNKNOWN', severity: 'info' };

const renderIssues = (props: Partial<ViewerIssuesProps> = {}) =>
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <ViewerIssues issues={[syntaxError]} isFailed={false} {...props}>
          {({ segment, list }) => (
            <div>
              {list}
              {segment}
            </div>
          )}
        </ViewerIssues>
      </TooltipProvider>
    </KeyboardProvider>,
  );

const segment = (): HTMLElement => screen.getByRole('button', { name: /Issues:/u });

describe('ViewerIssues', () => {
  it('should start closed, saying the build failed and counting each severity', () => {
    renderIssues({ issues: [warning, syntaxError, note], isFailed: true });

    expect(segment()).toHaveAccessibleName('Build failed. Issues: 1 error, 1 warning, 1 info');
    expect(segment()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Issues' })).not.toBeInTheDocument();
  });

  it('should draw nothing without issues or notices', () => {
    renderIssues({ issues: [] });

    expect(screen.queryByRole('button', { name: /Issues:/u })).not.toBeInTheDocument();
  });

  it('should list errors first, then warnings, then notes, and close on Escape back to the segment', async () => {
    const user = userEvent.setup();
    renderIssues({ issues: [note, warning, syntaxError] });

    await user.click(segment());
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);

    expect(items[0]).toContain('Unexpected token');
    expect(items[1]).toContain('Display simplified');
    expect(items[2]).toContain('Cached');

    fireEvent.keyDown(screen.getByRole('region', { name: 'Issues' }), { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Issues' })).not.toBeInTheDocument();
    expect(segment()).toHaveFocus();
  });

  it('should show the location as plain text without an opener, and open it through one', async () => {
    const user = userEvent.setup();
    const onOpenLocation = vi.fn();
    const { unmount } = renderIssues();
    await user.click(segment());

    expect(screen.getByText('main.ts:3:7').closest('[title]')).toHaveAttribute('title', '/src/main.ts');
    expect(screen.queryByRole('button', { name: 'main.ts:3:7' })).not.toBeInTheDocument();
    unmount();

    renderIssues({ onOpenLocation });
    await user.click(segment());
    await user.click(screen.getByRole('button', { name: 'main.ts:3:7' }));
    screen.getByRole('button', { name: 'main.ts:3:7' }).focus();
    await user.keyboard('{Enter}');

    expect(onOpenLocation.mock.calls).toEqual([
      [{ fileName: '/src/main.ts', lineNumber: 3, column: 7 }],
      [{ fileName: '/src/main.ts', lineNumber: 3, column: 7 }],
    ]);
  });

  it('should show user frames and keep platform internals behind a toggle', async () => {
    const user = userEvent.setup();
    renderIssues();
    await user.click(segment());
    await user.click(screen.getByRole('button', { name: 'Stack trace' }));

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.queryByText('evaluate')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show platform internals \(1 frames\)/u }));
    expect(screen.getByText('evaluate')).toBeInTheDocument();
  });

  it("should run the host's action on one issue, and on all of them when there are several", async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    renderIssues({ issues: [syntaxError, warning], onFix, fixLabel: 'Add to chat' });
    await user.click(segment());

    const [first, second] = screen.getAllByRole('button', { name: 'Add to chat' });
    await user.click(first!);
    await user.click(second!);
    await user.click(screen.getByRole('button', { name: 'Add to chat (2)' }));

    expect(onFix.mock.calls).toEqual([
      [{ issues: [syntaxError] }],
      [{ issues: [warning] }],
      [{ issues: [syntaxError, warning] }],
    ]);
  });

  it('should name the default action Fix with AI, and Fix all when there are several', async () => {
    const user = userEvent.setup();
    renderIssues({ issues: [syntaxError, warning], onFix: vi.fn(), onFixInNewChat: vi.fn() });
    await user.click(segment());

    expect(screen.getAllByRole('button', { name: 'Fix with AI' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Fix all 2 with AI' })).toBeInTheDocument();
  });

  it('should offer Prepare on a kernel that is not prepared', async () => {
    const user = userEvent.setup();
    const onPrepareKernel = vi.fn();
    const unprepared: KernelIssue = {
      message: 'The picogk kernel is not prepared.',
      code: 'KERNEL_NOT_PREPARED',
      severity: 'error',
      details: { kernel: 'picogk' },
    };
    renderIssues({ issues: [unprepared, warning], onPrepareKernel });
    await user.click(segment());

    expect(screen.getAllByRole('button', { name: 'Prepare' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Prepare' }));
    expect(onPrepareKernel).toHaveBeenCalledWith(unprepared);
  });

  it('should open for a notice, act on it, and inform without an action', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    renderIssues({
      issues: [],
      notices: [
        { message: 'The picogk kernel runtime is not on this computer yet.', actionLabel: 'Prepare', onAct },
        { message: 'KCL models render through Zoo.' },
      ],
    });

    expect(screen.getByRole('region', { name: 'Issues' })).toBeInTheDocument();
    expect(segment()).toHaveAccessibleName('Issues: 2 warnings');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Prepare' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Prepare' }));
    expect(onAct).toHaveBeenCalledOnce();
  });
});

describe('formatViewerIssue', () => {
  it('should list the message, the location and the stack', () => {
    expect(formatViewerIssue(syntaxError)).toBe(
      '- **Message:** Unexpected token\n- **Location:** Line 3, Column 7\n- **Stack Trace:**\n    1. main (/src/main.ts:3:7)\n    2. evaluate (worker.js:1:2)',
    );
    expect(formatViewerIssue(warning)).toBe('- **Message:** Display simplified\n- **Location:** Unknown location\n');
  });
});

describe('unpreparedKernelOf', () => {
  it('should name the kernel and size of the first KERNEL_NOT_PREPARED issue', () => {
    expect(
      unpreparedKernelOf([
        warning,
        {
          message: 'The picogk kernel is not prepared.',
          severity: 'error',
          code: 'KERNEL_NOT_PREPARED',
          details: { kernel: 'picogk', byteLength: 300_000_000 },
        },
      ]),
    ).toEqual({ kernel: 'picogk', byteLength: 300_000_000 });
    expect(
      unpreparedKernelOf([{ message: 'Not prepared', severity: 'error', code: 'KERNEL_NOT_PREPARED' }]),
    ).toBeUndefined();
    expect(unpreparedKernelOf([])).toBeUndefined();
  });
});
