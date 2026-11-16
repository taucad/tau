// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverwriteConfirmDialog } from '#components/filesystem/overwrite-confirm-dialog.js';
import type { OverwriteConfirmResult } from '#components/filesystem/overwrite-confirm-dialog.js';

describe('OverwriteConfirmDialog', () => {
  it('renders singular copy for a single target path', () => {
    render(<OverwriteConfirmDialog open targetPaths={['src/a.ts']} showRememberChoice={false} onResolve={vi.fn()} />);
    expect(screen.getByText("Replace 'src/a.ts'?")).toBeInTheDocument();
  });

  it('renders plural copy when multiple targets collide', () => {
    render(<OverwriteConfirmDialog open targetPaths={['a.ts', 'b.ts', 'c.ts']} onResolve={vi.fn()} />);
    expect(screen.getByText('Replace 3 existing items?')).toBeInTheDocument();
  });

  it("resolves with 'overwrite' when the Replace button is clicked", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn<(result: OverwriteConfirmResult) => void>();
    render(<OverwriteConfirmDialog open targetPaths={['src/a.ts']} showRememberChoice={false} onResolve={onResolve} />);
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onResolve).toHaveBeenCalledWith({ choice: 'overwrite', rememberChoice: false });
  });

  it("resolves with 'cancel' when the Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn<(result: OverwriteConfirmResult) => void>();
    render(<OverwriteConfirmDialog open targetPaths={['src/a.ts']} showRememberChoice={false} onResolve={onResolve} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onResolve).toHaveBeenCalledWith({ choice: 'cancel', rememberChoice: false });
  });

  it("carries rememberChoice through to the resolver on 'overwrite'", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn<(result: OverwriteConfirmResult) => void>();
    render(<OverwriteConfirmDialog open targetPaths={['a.ts', 'b.ts']} showRememberChoice onResolve={onResolve} />);

    await user.click(screen.getByLabelText('Do not ask again for this session'));
    await user.click(screen.getByRole('button', { name: 'Replace' }));

    expect(onResolve).toHaveBeenCalledWith({ choice: 'overwrite', rememberChoice: true });
  });

  it("does not surface rememberChoice on 'cancel'", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn<(result: OverwriteConfirmResult) => void>();
    render(<OverwriteConfirmDialog open targetPaths={['a.ts', 'b.ts']} showRememberChoice onResolve={onResolve} />);

    await user.click(screen.getByLabelText('Do not ask again for this session'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onResolve).toHaveBeenCalledWith({ choice: 'cancel', rememberChoice: false });
  });
});
