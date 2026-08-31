import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor, fromCallback } from 'xstate';
import { importGitHubMachine } from '#machines/import-github.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

vi.mock('#lib/github-api.js', () => ({
  getGitHubClient: vi.fn(() => ({
    getRepository: vi.fn(async () => ({
      avatarUrl: 'https://avatar.url',
      description: 'Test repo',
      stars: 10,
      forks: 5,
      watchers: 3,
      license: 'MIT',
      defaultBranch: 'main',
      isPrivate: false,
      lastUpdated: '2024-01-01',
    })),
    listBranches: vi.fn(async () => ({
      branches: [{ name: 'main', sha: 'abc', updatedAt: 1000 }],
      hasMore: false,
      endCursor: undefined,
    })),
    listFiles: vi.fn(async () => [{ path: 'main.ts', size: 100 }]),
    downloadArchiveWithSize: vi.fn(),
    getArchiveUrl: vi.fn(
      ({ owner, repo }: { owner: string; repo: string }) =>
        `/api/import?provider=github&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&ref=main`,
    ),
    getAuthHeaders: vi.fn(() => ({ 'User-Agent': 'test' })),
  })),
}));

vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn(async () => ({ files: {} })),
  },
}));

const stubMetadata = {
  avatarUrl: 'https://avatar.url' as string | undefined,
  description: 'Test repo' as string | undefined,
  stars: 10,
  forks: 5,
  watchers: 3,
  license: 'MIT' as string | undefined,
  defaultBranch: 'main',
  isPrivate: false,
  lastUpdated: '2024-01-01',
};

const stubBranches = [{ name: 'main', sha: 'abc', updatedAt: 1000 }];
const stubFiles = [{ path: 'main.ts', size: 100 }];

function createTestActor(options?: {
  owner?: string;
  repo?: string;
  ref?: string;
  mainFile?: string;
  downloadThrows?: boolean;
}) {
  const machine = importGitHubMachine.provide({
    actors: {
      getRepoMetadataActor: fromSafeAsync(async () => {
        return { type: 'metadataRetrieved', metadata: stubMetadata };
      }),
      getBranchesActor: fromSafeAsync(async () => {
        return {
          type: 'branchesRetrieved',
          branches: stubBranches,
          hasMore: false as boolean,
          endCursor: undefined as string | undefined,
        };
      }),
      getFilesActor: fromSafeAsync(async () => {
        return { type: 'filesRetrieved', files: stubFiles };
      }),
      importWorkerActor: fromCallback(({ sendBack }) => {
        if (options?.downloadThrows) {
          queueMicrotask(() => {
            sendBack({ type: 'workerError', message: 'download failed', phase: 'download' });
          });
        } else {
          queueMicrotask(() => {
            sendBack({
              type: 'workerExtractComplete',
              filePaths: ['main.ts'],
              files: [{ path: 'main.ts', content: new Uint8Array([1, 2, 3]) }],
            });
          });
        }
        // Noop cleanup
        return () => undefined;
      }),
      createProjectActor: fromSafeAsync(async () => {
        return { type: 'projectCreated', projectId: 'proj_123' };
      }),
    },
    delays: {
      debounceDelay: 0,
    },
  });

  return createActor(machine, {
    input: {
      owner: options?.owner,
      repo: options?.repo,
      ref: options?.ref,
      mainFile: options?.mainFile,
    },
  });
}

describe('importGitHubMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start in enteringDetails state with no input', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('enteringDetails');
      actor.stop();
    });

    it('should have correct context defaults', () => {
      const actor = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.owner).toBe('');
      expect(context.repo).toBe('');
      expect(context.ref).toBe('main');
      expect(context.repoMetadata).toBeUndefined();
      expect(context.branches).toEqual([]);
      expect(context.files.size).toBe(0);
      expect(context.projectId).toBeUndefined();
      expect(context.error).toBeUndefined();
      actor.stop();
    });
  });

  describe('repository URL parsing', () => {
    it('should transition to checkingRepo on updateRepoUrl', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'updateRepoUrl', url: 'https://github.com/test/repo' });
      expect(actor.getSnapshot().value).toBe('checkingRepo');
      actor.stop();
    });

    it('should parse valid GitHub URL and set owner/repo', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'updateRepoUrl', url: 'https://github.com/myorg/myrepo' });
      const { context } = actor.getSnapshot();
      expect(context.owner).toBe('myorg');
      expect(context.repo).toBe('myrepo');
      actor.stop();
    });
  });

  describe('fetching repo info', () => {
    it('should fetch repo info with valid owner/repo from input', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();

      // With debounceDelay: 0, should quickly move through checkingRepo -> fetchingRepoInfo
      await waitFor(actor, (s) => s.value === 'enteringDetails', { timeout: 5000 });

      const { context } = actor.getSnapshot();
      expect(context.repoMetadata).toBeDefined();
      expect(context.repoMetadata?.description).toBe('Test repo');
      actor.stop();
    });

    it('should set metadata in context', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      const { context } = actor.getSnapshot();
      expect(context.repoMetadata?.stars).toBe(10);
      expect(context.repoMetadata?.license).toBe('MIT');
      expect(context.repoMetadata?.defaultBranch).toBe('main');
      actor.stop();
    });

    it('should set branches from branchesRetrieved', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.branches.length > 0, { timeout: 5000 });
      expect(actor.getSnapshot().context.branches).toEqual(stubBranches);
      actor.stop();
    });

    it('should set repo files from filesRetrieved', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoFiles.length > 0, { timeout: 5000 });
      expect(actor.getSnapshot().context.repoFiles).toEqual(stubFiles);
      actor.stop();
    });
  });

  describe('importing', () => {
    it('should transition to downloading on startImport', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      const { value } = actor.getSnapshot();
      expect(['downloading', 'selectingMainFile'].includes(value as string)).toBe(true);
      actor.stop();
    });

    it('should reach selectingMainFile after successful worker extraction', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'selectingMainFile', { timeout: 5000 });

      const { context } = actor.getSnapshot();
      expect(context.importedFilePaths).toEqual(['main.ts']);
      expect(context.files.size).toBe(1);
      expect(context.files.has('main.ts')).toBe(true);
      actor.stop();
    });

    it('should auto-select main file matching CAD extensions from importedFilePaths', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'selectingMainFile', { timeout: 5000 });

      expect(actor.getSnapshot().context.selectedMainFile).toBe('main.ts');
      actor.stop();
    });

    it('should go to error on download failure', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo', downloadThrows: true });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'error', { timeout: 5000 });
      expect(actor.getSnapshot().context.error?.message).toContain('download failed');
      actor.stop();
    });

    it('should include phase in error message from worker', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo', downloadThrows: true });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'error', { timeout: 5000 });
      expect(actor.getSnapshot().context.error?.message).toContain('download');
      actor.stop();
    });

    it('should recover from error with retry', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo', downloadThrows: true });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'error', { timeout: 5000 });
      actor.send({ type: 'retry' });
      expect(actor.getSnapshot().value).toBe('enteringDetails');
      actor.stop();
    });

    it('should return to enteringDetails on cancelDownload during downloading', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });

      const snap = actor.getSnapshot();
      if (snap.value === 'downloading') {
        actor.send({ type: 'cancelDownload' });
        expect(actor.getSnapshot().value).toBe('enteringDetails');
      }
      actor.stop();
    });

    it('should return to enteringDetails on cancelReview from selectingMainFile', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'startImport' });
      await waitFor(actor, (s) => s.value === 'selectingMainFile', { timeout: 5000 });

      actor.send({ type: 'cancelReview' });

      const { context, value } = actor.getSnapshot();
      expect(value).toBe('enteringDetails');
      expect(context.repoUrl).toBe('');
      expect(context.owner).toBe('');
      expect(context.repo).toBe('');
      expect(context.files.size).toBe(0);
      actor.stop();
    });
  });

  describe('branch and file selection', () => {
    it('should handle selectBranch event', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'selectBranch', branch: 'develop' });
      expect(actor.getSnapshot().context.selectedBranch).toBe('develop');
      expect(actor.getSnapshot().context.ref).toBe('develop');
      actor.stop();
    });

    it('should handle selectMainFile event', async () => {
      const actor = createTestActor({ owner: 'test', repo: 'repo' });
      actor.start();
      await waitFor(actor, (s) => s.value === 'enteringDetails' && s.context.repoMetadata !== undefined, {
        timeout: 5000,
      });
      actor.send({ type: 'selectMainFile', file: 'custom.ts' });
      expect(actor.getSnapshot().context.selectedMainFile).toBe('custom.ts');
      actor.stop();
    });
  });
});
