// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  executeRpcCall: vi.fn(),
}));

vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: (path: string | undefined): FileContentResult => {
    if (path === undefined) {
      return { kind: 'loading' };
    }
    const text = mocks.files.get(path);
    return text === undefined ? { kind: 'orphaned' } : { kind: 'text', content: new TextEncoder().encode(text) };
  },
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({}) }));
vi.mock('#hooks/rpc-handlers.js', () => ({
  createRpcHandlers: () => ({ executeRpcCall: mocks.executeRpcCall }),
}));

const { PackagesPanel } = await import('#routes/w.$workspace.$project/packages-panel.js');

const manifest = {
  name: 'lamp',
  dependencies: { alea: '^1.0.1', 'd3-shape': '^3', 'simplex-noise': '^4.0.3', three: '^0.170.0' },
};
const lockOf = (dependencies: Record<string, string>): string =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'lamp', dependencies },
      'node_modules/alea': { version: '1.0.1' },
      'node_modules/d3-shape': { version: '3.2.0' },
      'node_modules/simplex-noise': { version: '4.0.3' },
    },
  });

const renderPanel = (): void => {
  render(
    <TooltipProvider>
      <PackagesPanel />
    </TooltipProvider>,
  );
};

const statusOf = (name: string): string =>
  within(screen.getByRole('list', { name: 'Dependencies' }))
    .getByText(name)
    .closest('li')!.textContent;

beforeEach(() => {
  mocks.files.clear();
  mocks.executeRpcCall.mockReset();
  mocks.files.set('package.json', JSON.stringify(manifest));
});

afterEach(cleanup);

describe('PackagesPanel', () => {
  it('should mark every dependency not locked when the project has no lock', () => {
    renderPanel();

    for (const name of Object.keys(manifest.dependencies)) {
      expect(statusOf(name)).toContain('Not locked');
    }
  });

  it('should map each dependency to locked, not installed or not locked from the lock and node_modules', () => {
    mocks.files.set('package-lock.json', lockOf(manifest.dependencies));
    mocks.files.set('node_modules/alea/package.json', '{"name":"alea","version":"1.0.1"}');
    mocks.files.set('node_modules/simplex-noise/package.json', '{"name":"simplex-noise","version":"4.0.3"}');
    renderPanel();

    expect(statusOf('alea')).toBe('alea1.0.1Locked');
    expect(statusOf('simplex-noise')).toBe('simplex-noise4.0.3Locked');
    expect(statusOf('d3-shape')).toBe('d3-shape3.2.0Not installed');
    // The root entry declares three, but the lock has no row for it.
    expect(statusOf('three')).toBe('three^0.170.0Not locked');
  });

  it('should mark every dependency stale when package.json and the lock declare different ranges', () => {
    mocks.files.set('package-lock.json', lockOf({ ...manifest.dependencies, alea: '^1.0.0' }));
    mocks.files.set('node_modules/alea/package.json', '{}');
    renderPanel();

    for (const name of Object.keys(manifest.dependencies)) {
      expect(statusOf(name)).toContain('Lock out of date');
    }
  });

  it('should run install_packages once from the manifest and show the issues it returns', async () => {
    const message = "No published version of 'three' matches '^0.170.0'. Change the range in package.json.";
    let settle: (value: unknown) => void = () => undefined;
    mocks.executeRpcCall.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderPanel();

    const button = screen.getByRole('button', { name: 'Install' });
    await userEvent.click(button);

    expect(screen.getByRole('button', { name: 'Installing…' })).toBeDisabled();
    expect(mocks.executeRpcCall).toHaveBeenCalledOnce();
    expect(mocks.executeRpcCall).toHaveBeenCalledWith(
      expect.objectContaining({ rpcName: 'install_packages', args: {} }),
    );

    settle({
      success: true,
      manifestChanged: false,
      lockChanged: false,
      packages: [],
      issues: [{ code: 'no-matching-version', name: 'three', message }],
    });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('should offer the npm command as copyable text and never run it', () => {
    renderPanel();

    expect(screen.getByText('npm ci --ignore-scripts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run a model outside Tau' })).toHaveAttribute(
      'href',
      'https://docs.tau.new/editor/packages#run-the-project-outside-tau',
    );
  });
});
