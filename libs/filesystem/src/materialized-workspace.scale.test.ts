import { describe, expect, it } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { MaterializedWorkspaceAuthority } from '#materialized-workspace.js';
import { materializedWorkspaceId } from '#workspace-identity.js';

const runScale = process.env['TAU_C0_SCALE'] === '1';

describe.runIf(runScale)('MaterializedWorkspaceAuthority C0 scale evidence', () => {
  it('materializes and verifies the 100,000-file control fixture', { timeout: 120_000 }, async () => {
    const provider = new MemoryProvider();
    const mountTable = new MountTable();
    mountTable.mount('/project', provider, { backend: 'memory', storageRootKey: 'memory:c0-scale' });
    const eventBus = new ChangeEventBus();
    const resourceQueue = new ResourceQueue();
    const crossTabCoordinator = new CrossTabCoordinator();
    const service = new WorkspaceFileService({
      providerRegistry: new ProviderRegistry(),
      resourceQueue,
      eventBus,
      crossTabCoordinator,
      mountTable,
    });
    try {
      const fileCount = 100_000;
      const base = new ImmutableRevisionTree(
        Array.from({ length: fileCount }, (_, index) => [
          `src/${index.toString().padStart(6, '0')}.txt`,
          `fixture-${index}`,
        ]),
      );
      const authority = new MaterializedWorkspaceAuthority({
        filesystem: service.createRootedFileSystem('/project'),
        resourceQueue,
        materializationConcurrency: 32,
      });

      const workspace = await authority.materialize({
        workspaceId: materializedWorkspaceId('scale-100k'),
        baseRevisionId: revisionId('rev-scale-100k'),
        tree: base,
      });

      expect(workspace.metrics.files).toBe(fileCount);
      expect(workspace.metrics.bytes).toBe(base.byteLength);
      await expect(workspace.filesystem.readFile('src/000000.txt', 'utf8')).resolves.toBe('fixture-0');
      await expect(workspace.filesystem.readFile('src/099999.txt', 'utf8')).resolves.toBe('fixture-99999');
      // The metric is intentionally asserted only for finiteness; hardware-specific
      // gate selection belongs in the program decision artifact.
      expect(Number.isFinite(workspace.metrics.durationMs)).toBe(true);
    } finally {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
      crossTabCoordinator.dispose();
    }
  });
});
