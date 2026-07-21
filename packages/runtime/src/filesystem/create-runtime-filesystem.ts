/**
 * Decorate a `RuntimeFileSystemBase` provider into a full `KernelFileSystem`
 * by delegating routing/cache/watch to the canonical Layer 2
 * {@link FileSystemService} from `@taucad/filesystem`.
 *
 * The kernel facade (`KernelFileSystem`) is a thin wrapper around
 * `FileSystemService.asRuntimeFileSystem()`. Backends still implement the
 * 11 `FileSystemProvider` primitives; the four enhanced helpers (`readFiles`,
 * `readdirContents`, `readdirStat`, `ensureDir`) come from the service. Bases
 * may supply their own optimised overrides for the helpers and they are
 * preserved on top of the service-derived facade.
 */

import { createFileSystemService } from '@taucad/filesystem';
import type { KernelFileSystem, RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

type EnhancedMethods = Pick<KernelFileSystem, 'readFiles' | 'readdirContents' | 'readdirStat' | 'ensureDir'>;

/**
 * Create an enhanced `KernelFileSystem` from a base provider implementation.
 * The provider is mounted as runtime `/`; all resulting filesystem methods
 * operate on paths within that supplied filesystem.
 *
 * Internally constructs a single-mount {@link FileSystemService} so the kernel
 * facade gains routing, cache integration, and watch fan-out for free. Bases
 * that already provide optimised helpers (`readFiles`/`readdirContents`/
 * `readdirStat`/`ensureDir`) keep them — overrides win over the service
 * defaults, exactly as before the refactor.
 *
 * @param base - Base filesystem mounted as runtime `/`, with optional enhanced overrides.
 * @returns Full KernelFileSystem with all enhanced methods guaranteed.
 * @public
 */
export function createRuntimeFileSystem(base: RuntimeFileSystemBase & Partial<EnhancedMethods>): KernelFileSystem {
  const service = createFileSystemService();
  service.mount('/', base, { backend: 'memory' });
  const decorated = service.asRuntimeFileSystem();
  const watchFunction = base.watch?.bind(base);

  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? decorated.readFile(path, 'utf8') : decorated.readFile(path);
  }

  const facade: KernelFileSystem = {
    id: base.id,
    capabilities: base.capabilities,
    dispose: base.dispose.bind(base),
    readFile,
    writeFile: decorated.writeFile.bind(decorated),
    readdir: decorated.readdir.bind(decorated),
    stat: decorated.stat.bind(decorated),
    lstat: decorated.lstat.bind(decorated),
    mkdir: decorated.mkdir.bind(decorated),
    unlink: decorated.unlink.bind(decorated),
    rmdir: decorated.rmdir.bind(decorated),
    rename: decorated.rename.bind(decorated),
    exists: decorated.exists.bind(decorated),
    readFiles: base.readFiles ?? decorated.readFiles.bind(decorated),
    readdirContents: base.readdirContents ?? decorated.readdirContents.bind(decorated),
    readdirStat: base.readdirStat ?? decorated.readdirStat.bind(decorated),
    ensureDir: base.ensureDir ?? decorated.ensureDir.bind(decorated),
  };

  if (watchFunction) {
    facade.watch = watchFunction;
  }

  return facade;
}
