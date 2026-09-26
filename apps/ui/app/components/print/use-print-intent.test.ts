// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printIntentPath } from '@taucad/slicer';
import { projectFiles } from '#components/print/testing/project-files.js';
import { usePrintIntent } from '#components/print/use-print-intent.js';

vi.mock('#hooks/use-file-manager.js', async () => {
  const testing = await import('#components/print/testing/project-files.js');
  return { useFileManager: () => testing.projectFiles.fileManager };
});

/** A Bambu Studio setting key, which is snake case. */
const wallLoops = 'wall_loops';

const canonical = (intent: Record<string, unknown>): string => `${JSON.stringify(intent, undefined, 2)}\n`;

const renderIntent = (model: string | undefined = 'x1c') => renderHook(() => usePrintIntent(model));

beforeEach(() => {
  projectFiles.clear();
});

describe('usePrintIntent', () => {
  // ── Reading ──────────────────────────────────────────────────────────────

  describe('reading', () => {
    it('should apply the file only when it names the selected model', async () => {
      projectFiles.write(printIntentPath, canonical({ model: 'x1c', preset: 'fine' }));
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c', preset: 'fine' });
      });

      const other = renderIntent('p1s');
      await waitFor(() => {
        expect(other.result.current.file).toEqual({ status: 'current', intent: { model: 'x1c', preset: 'fine' } });
      });
      expect(other.result.current.intent).toBeUndefined();
    });

    it('should read a missing file as absent and bytes the schema refuses as invalid', async () => {
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file).toEqual({ status: 'absent' });
      });

      act(() => {
        projectFiles.write(printIntentPath, '{"model":"x1c","serial":"00M00A000000000"}');
      });
      await waitFor(() => {
        expect(result.current.file).toEqual({ status: 'invalid' });
      });
      expect(result.current.intent).toBeUndefined();
    });

    it("should follow another writer's change through the watch", async () => {
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('absent');
      });

      act(() => {
        projectFiles.write(printIntentPath, canonical({ model: 'x1c', plate: 'cool' }));
      });

      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c', plate: 'cool' });
      });
    });
  });

  // ── Writing ──────────────────────────────────────────────────────────────

  describe('writing', () => {
    it('should create the file on the first change, holding only the changed keys in canonical bytes', async () => {
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('absent');
      });

      act(() => {
        result.current.update((intent) => ({ ...intent, settings: { [wallLoops]: 3 }, preset: 'fine' }));
      });

      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c', preset: 'fine', settings: { [wallLoops]: 3 } });
      });
      expect(projectFiles.read(printIntentPath)).toBe(
        '{\n  "model": "x1c",\n  "preset": "fine",\n  "settings": {\n    "wall_loops": 3\n  }\n}\n',
      );
      expect(projectFiles.writes).toHaveLength(1);
      expect(projectFiles.writes[0]?.preconditions).toEqual([
        { path: `${projectFiles.root}/${printIntentPath}`, expected: null },
      ]);
    });

    it('should adopt the echo of its own write without publishing the file again', async () => {
      const { contentService, parameterFiles } = projectFiles.fileManager;
      // Hold the watch, so the echo arrives only when the test delivers it.
      let notify = (): void => undefined;
      const subscribe = vi.spyOn(contentService, 'subscribe').mockImplementation((_path, listener) => {
        notify = listener;
        return () => undefined;
      });
      const readFile = vi.spyOn(parameterFiles, 'readFile');
      try {
        const { result } = renderIntent();
        await waitFor(() => {
          expect(result.current.file.status).toBe('absent');
        });
        act(() => {
          result.current.update((intent) => ({ ...intent, preset: 'fast' }));
        });
        await waitFor(() => {
          expect(result.current.intent?.preset).toBe('fast');
        });
        const written = result.current.file;

        // The write's own watch notification re-reads the file and finds the bytes it just wrote.
        act(() => {
          notify();
        });
        await waitFor(() => {
          expect(readFile).toHaveBeenCalledOnce();
        });
        await act(async () => {
          await readFile.mock.results[0]?.value;
        });
        expect(result.current.file).toBe(written);
      } finally {
        subscribe.mockRestore();
        readFile.mockRestore();
      }
    });

    it('should replace a file written for another model on the first change', async () => {
      projectFiles.write(printIntentPath, canonical({ model: 'p1s', preset: 'fast', settings: { [wallLoops]: 4 } }));
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('current');
      });
      expect(result.current.intent).toBeUndefined();

      act(() => {
        result.current.update((intent) => ({ ...intent, plate: 'cool' }));
      });

      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c', plate: 'cool' });
      });
    });

    it('should keep a file it cannot read, and replace it only on reset', async () => {
      const unreadable = '{"model":"x1c","preset":';
      projectFiles.write(printIntentPath, unreadable);
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('invalid');
      });

      act(() => {
        result.current.update((intent) => ({ ...intent, preset: 'fine' }));
        result.current.reset();
      });

      // Changes run in order, so once the reset has landed the change before it has run and written nothing.
      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c' });
      });
      expect(projectFiles.writes).toHaveLength(1);
      expect(projectFiles.read(printIntentPath)).toBe('{\n  "model": "x1c"\n}\n');
      // The reset's precondition is the preserved bytes, so a concurrent repair is never overwritten.
      const expected = projectFiles.writes[0]?.preconditions[0]?.expected;
      expect(expected instanceof Uint8Array ? new TextDecoder().decode(expected) : expected).toBe(unreadable);
    });

    it('should return stable callbacks across rerenders', async () => {
      const { result, rerender } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('absent');
      });
      const { update, reset } = result.current;

      rerender();

      expect(result.current.update).toBe(update);
      expect(result.current.reset).toBe(reset);
    });
  });

  // ── Conflicts ────────────────────────────────────────────────────────────

  describe('conflicts', () => {
    it("should re-read after a conflict and apply the change again, keeping the other writer's key", async () => {
      projectFiles.write(printIntentPath, canonical({ model: 'x1c' }));
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c' });
      });
      projectFiles.race(canonical({ model: 'x1c', plate: 'cool' }));

      act(() => {
        result.current.update((intent) => ({ ...intent, preset: 'fine' }));
      });

      await waitFor(() => {
        expect(result.current.intent).toEqual({ model: 'x1c', plate: 'cool', preset: 'fine' });
      });
      expect(projectFiles.writes).toHaveLength(2);
      expect(result.current.error).toBeUndefined();
    });

    it('should give up after the third conflict and say so with RECORD_CONFLICT', async () => {
      const { result } = renderIntent();
      await waitFor(() => {
        expect(result.current.file.status).toBe('absent');
      });
      projectFiles.race(
        canonical({ model: 'x1c', settings: { [wallLoops]: 1 } }),
        canonical({ model: 'x1c', settings: { [wallLoops]: 2 } }),
        canonical({ model: 'x1c', settings: { [wallLoops]: 3 } }),
      );

      act(() => {
        result.current.update((intent) => ({ ...intent, preset: 'fine' }));
      });

      await waitFor(() => {
        expect(result.current.error).toMatch(/RECORD_CONFLICT/u);
      });
      expect(projectFiles.writes).toHaveLength(3);
      expect(projectFiles.read(printIntentPath)).toBe(canonical({ model: 'x1c', settings: { [wallLoops]: 3 } }));
    });
  });
});
