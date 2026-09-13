import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { fileUnchangedMarker } from '@taucad/chat/constants';
import type { ActivityGroup, FoldableRun, StandaloneRun } from '#utils/assistant-message-activity.js';
import {
  classifyActivityPart,
  groupAssistantParts,
  findLastMeaningfulPartIndex,
  isSectionFoldable,
  partitionActivityRuns,
  shouldWrapRun,
} from '#utils/assistant-message-activity.js';

type Parts = MyUIMessage['parts'];
type Part = Parts[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

const textPart = (text = 'Hello'): Part => ({ type: 'text', text });
const reasoningPart = (text = 'Thinking...'): Part => ({ type: 'reasoning', text });
const stepStartPart = (): Part => ({ type: 'step-start' });

const toolPart = (toolType: string, state = 'output-available'): Part =>
  ({
    type: toolType,
    toolCallId: `call-${toolType}-${Math.random().toString(36).slice(2, 6)}`,
    state,
    input: {},
    output: {},
  }) as unknown as Part;

const readFilePart = (state?: string) => toolPart('tool-read_file', state);
const listDirectoryPart = (state?: string) => toolPart('tool-list_directory', state);
const grepPart = (state?: string) => toolPart('tool-grep', state);
const globPart = (state?: string) => toolPart('tool-glob_search', state);
const editFilePart = (state?: string) => toolPart('tool-edit_file', state);
const createFilePart = (state?: string) => toolPart('tool-create_file', state);
const deleteFilePart = (state?: string) => toolPart('tool-delete_file', state);
const editTestsPart = (state?: string) => toolPart('tool-edit_tests', state);
const exportGeometryPart = (state?: string) => toolPart('tool-export_geometry', state);
const webSearchPart = (state?: string) => toolPart('tool-web_search', state);
const webBrowserPart = (state?: string) => toolPart('tool-web_browser', state);
const screenshotPart = (state?: string): Part =>
  ({
    ...toolPart('tool-screenshot', state),
    output: { images: [] },
  }) as unknown as Part;
const kernelResultPart = (state?: string) => toolPart('tool-get_kernel_result', state);
const testModelPart = (state?: string): Part =>
  ({
    ...toolPart('tool-test_model', state),
    output: { passes: [], failures: [] },
  }) as unknown as Part;
const transferPart = (state?: string) => toolPart('tool-transfer_to_cad_expert', state);

type ScreenshotImage = { view: string; dataUrl: string };

const screenshotPartWithImages = (images: readonly ScreenshotImage[]): Part =>
  ({
    ...screenshotPart(),
    state: 'output-available',
    output: { images },
  }) as unknown as Part;

const compositeScreenshotPart = (): Part =>
  screenshotPartWithImages([{ view: 'composite', dataUrl: 'data:image/png;base64,AAAA' }]);

const testModelPartWithCounts = (passes: number, failures: number): Part =>
  ({
    ...testModelPart(),
    state: 'output-available',
    output: {
      passes: Array.from({ length: passes }, (_, i) => ({
        id: `p${i}`,
        requirement: `req-pass-${i}`,
        targetFile: 'main.scad',
      })),
      failures: Array.from({ length: failures }, (_, i) => ({
        id: `f${i}`,
        requirement: `req-fail-${i}`,
        reason: 'reason',
        suggestion: 'suggestion',
        targetFile: 'main.scad',
      })),
    },
  }) as unknown as Part;

const expectAggregated = (group: ActivityGroup) => {
  expect(group.kind).toBe('aggregated');
  if (group.kind !== 'aggregated') {
    throw new Error('Expected aggregated group');
  }
  return group;
};

const expectFoldable = (run: ReturnType<typeof partitionActivityRuns>[number]): FoldableRun => {
  expect(run.kind).toBe('foldable-run');
  if (run.kind !== 'foldable-run') {
    throw new Error('Expected foldable-run');
  }
  return run;
};

const expectStandalone = (run: ReturnType<typeof partitionActivityRuns>[number]): StandaloneRun => {
  expect(run.kind).toBe('standalone');
  if (run.kind !== 'standalone') {
    throw new Error('Expected standalone');
  }
  return run;
};

/**
 * Resolves the first foldable run from `parts`. Used by `shouldWrapRun` tests
 * that need to assert the wrap decision for a known-research run regardless
 * of any leading/trailing standalone runs.
 */
const firstFoldable = (parts: Parts): FoldableRun => {
  const runs = partitionActivityRuns(groupAssistantParts(parts));
  const foldable = runs.find((r): r is FoldableRun => r.kind === 'foldable-run');
  if (!foldable) {
    throw new Error('Expected at least one foldable run');
  }
  return foldable;
};

// ── classifyActivityPart ─────────────────────────────────────────────────────

describe('classifyActivityPart', () => {
  it('should classify text parts as text', () => {
    expect(classifyActivityPart(textPart())).toBe('text');
  });

  it('should classify empty text parts as skip', () => {
    expect(classifyActivityPart(textPart(''))).toBe('skip');
  });

  it('should classify whitespace-only text parts as skip', () => {
    expect(classifyActivityPart(textPart('   '))).toBe('skip');
    expect(classifyActivityPart(textPart('\n\n  \t'))).toBe('skip');
  });

  it('should classify reasoning parts as reasoning', () => {
    expect(classifyActivityPart(reasoningPart())).toBe('reasoning');
  });

  it('should classify step-start as skip', () => {
    expect(classifyActivityPart(stepStartPart())).toBe('skip');
  });

  it('should classify data-usage as skip', () => {
    const part = { type: 'data-usage', data: {} } as unknown as Part;
    expect(classifyActivityPart(part)).toBe('skip');
  });

  it('should classify data-context-compaction as singleton', () => {
    const part = { type: 'data-context-compaction', data: {} } as unknown as Part;
    expect(classifyActivityPart(part)).toBe('data');
  });

  it('should classify data-context-usage as skip', () => {
    const part = { type: 'data-context-usage', data: {} } as unknown as Part;
    expect(classifyActivityPart(part)).toBe('skip');
  });

  it('should classify web_search and web_browser into research category', () => {
    expect(classifyActivityPart(webSearchPart())).toBe('research');
    expect(classifyActivityPart(webBrowserPart())).toBe('research');
  });

  it('should classify read_file, list_directory, grep, glob_search into research category', () => {
    expect(classifyActivityPart(readFilePart())).toBe('research');
    expect(classifyActivityPart(listDirectoryPart())).toBe('research');
    expect(classifyActivityPart(grepPart())).toBe('research');
    expect(classifyActivityPart(globPart())).toBe('research');
  });

  it('should classify edit_file, create_file, delete_file, edit_tests, export_geometry into write category', () => {
    expect(classifyActivityPart(editFilePart())).toBe('write');
    expect(classifyActivityPart(createFilePart())).toBe('write');
    expect(classifyActivityPart(deleteFilePart())).toBe('write');
    expect(classifyActivityPart(editTestsPart())).toBe('write');
    expect(classifyActivityPart(exportGeometryPart())).toBe('write');
  });

  it('should classify get_kernel_result, screenshot, test_model into research category', () => {
    expect(classifyActivityPart(kernelResultPart())).toBe('research');
    expect(classifyActivityPart(screenshotPart())).toBe('research');
    expect(classifyActivityPart(testModelPart())).toBe('research');
  });

  it('should classify transfer tools as transfer', () => {
    expect(classifyActivityPart(transferPart())).toBe('transfer');
  });
});

// ── groupAssistantParts ──────────────────────────────────────────────────────

describe('groupAssistantParts', () => {
  describe('singleton passthrough', () => {
    it('should pass text parts through as singletons', () => {
      const parts: Parts = [textPart('Hello')];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const first = groups[0]!;
      expect(first.kind).toBe('singleton');
      if (first.kind === 'singleton') {
        expect(first.part.type).toBe('text');
      }
    });

    it('should pass reasoning parts through as singletons', () => {
      const parts: Parts = [reasoningPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      expect(groups[0]!.kind).toBe('singleton');
    });

    it('should skip step-start parts entirely', () => {
      const parts: Parts = [stepStartPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(0);
    });

    it('should skip data-usage parts entirely', () => {
      const parts: Parts = [{ type: 'data-usage', data: {} } as unknown as Part];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(0);
    });

    it('should skip empty text parts entirely', () => {
      const parts: Parts = [textPart('')];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(0);
    });

    it('should skip whitespace-only text parts entirely', () => {
      const parts: Parts = [textPart('   \n\t  ')];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(0);
    });

    it('should pass data-context-compaction as singleton', () => {
      const parts: Parts = [{ type: 'data-context-compaction', data: {} } as unknown as Part];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      expect(groups[0]!.kind).toBe('singleton');
    });

    it('should pass transfer tools as singletons', () => {
      const parts: Parts = [transferPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      expect(groups[0]!.kind).toBe('singleton');
    });
  });

  describe('aggregation of consecutive tools', () => {
    it('should merge consecutive explore tools into one research group', () => {
      const parts: Parts = [readFilePart(), listDirectoryPart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.category).toBe('research');
      expect(group.parts).toHaveLength(3);
    });

    it('should merge consecutive web tools into one research group', () => {
      const parts: Parts = [webSearchPart(), webBrowserPart(), webSearchPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.category).toBe('research');
      expect(group.parts).toHaveLength(3);
    });

    it('should aggregate interleaved explore and web tools into a single research group', () => {
      const parts: Parts = [readFilePart(), webSearchPart(), grepPart(), webBrowserPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.category).toBe('research');
      expect(group.parts).toHaveLength(4);
    });

    it('should keep consecutive write tools as singletons', () => {
      const parts: Parts = [editFilePart(), createFilePart(), deleteFilePart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      for (const group of groups) {
        expect(group.kind).toBe('singleton');
        if (group.kind === 'singleton') {
          expect(group.category).toBe('write');
        }
      }
    });

    it('should aggregate consecutive CAD verification tools into a single research group', () => {
      const parts: Parts = [kernelResultPart(), screenshotPart(), testModelPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.category).toBe('research');
      expect(group.parts).toHaveLength(3);
    });

    it('should keep a single research tool as an aggregated group with one part', () => {
      const parts: Parts = [readFilePart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.parts).toHaveLength(1);
    });
  });

  describe('group splitting', () => {
    it('should not merge research tools separated by text', () => {
      const parts: Parts = [readFilePart(), textPart('found something'), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      expect(groups[0]!.kind).toBe('aggregated');
      expect(groups[1]!.kind).toBe('singleton');
      expect(groups[2]!.kind).toBe('aggregated');
    });

    it('should split research from non-aggregatable categories', () => {
      const parts: Parts = [readFilePart(), listDirectoryPart(), editFilePart(), createFilePart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      expect(expectAggregated(groups[0]!).category).toBe('research');
      expect(groups[1]!.kind).toBe('singleton');
      expect(groups[2]!.kind).toBe('singleton');
      if (groups[1]!.kind === 'singleton') {
        expect(groups[1]!.category).toBe('write');
      }
      if (groups[2]!.kind === 'singleton') {
        expect(groups[2]!.category).toBe('write');
      }
    });

    it('should treat step-start as transparent — not splitting adjacent groups', () => {
      const parts: Parts = [readFilePart(), stepStartPart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.parts).toHaveLength(2);
    });

    it('should treat empty text as transparent — not splitting adjacent research tools', () => {
      const parts: Parts = [webSearchPart(), textPart(''), webSearchPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.parts).toHaveLength(2);
    });

    it('should treat whitespace-only text as transparent — not splitting adjacent research tools', () => {
      const parts: Parts = [readFilePart(), textPart('   \n'), webSearchPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.parts).toHaveLength(2);
    });
  });

  describe('complex sequences', () => {
    it('should handle reasoning, research, text answer sequence', () => {
      const parts: Parts = [
        reasoningPart(),
        readFilePart(),
        listDirectoryPart(),
        grepPart(),
        textPart('Here is my answer'),
      ];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      expect(groups[0]!.kind).toBe('singleton');
      expect(groups[1]!.kind).toBe('aggregated');
      expect(groups[2]!.kind).toBe('singleton');
    });

    it('should handle research, write singletons, text, research, text', () => {
      const parts: Parts = [
        readFilePart(),
        grepPart(),
        editFilePart(),
        createFilePart(),
        textPart('Made some changes'),
        readFilePart(),
        textPart('Final answer'),
      ];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(6);
      expect(expectAggregated(groups[0]!).category).toBe('research');
      expect(groups[1]!.kind).toBe('singleton');
      expect(groups[2]!.kind).toBe('singleton');
      expect(groups[3]!.kind).toBe('singleton');
      expect(groups[4]!.kind).toBe('aggregated');
      expect(groups[5]!.kind).toBe('singleton');
    });

    it('should preserve original part indices in aggregated groups', () => {
      const parts: Parts = [readFilePart(), stepStartPart(), grepPart(), textPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(2);
      const group = expectAggregated(groups[0]!);
      expect(group.partIndices).toEqual([0, 2]);
    });

    it('should handle empty parts array', () => {
      const groups = groupAssistantParts([]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('reasoning bridging', () => {
    it('should absorb a single reasoning part sandwiched between two research runs into one aggregated group', () => {
      const parts: Parts = [grepPart(), reasoningPart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.category).toBe('research');
      expect(group.parts).toHaveLength(3);
      expect(group.parts[1]!.type).toBe('reasoning');
      expect(group.summaryDetail).toBe('2 searches');
      expect(group.partIndices).toEqual([0, 1, 2]);
    });

    it('should keep leading reasoning as a separate singleton', () => {
      const parts: Parts = [reasoningPart(), grepPart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(2);
      expect(groups[0]!.kind).toBe('singleton');
      if (groups[0]!.kind === 'singleton') {
        expect(groups[0]!.category).toBe('reasoning');
      }
      const aggregated = expectAggregated(groups[1]!);
      expect(aggregated.parts).toHaveLength(2);
      expect(aggregated.summaryDetail).toBe('2 searches');
    });

    it('should keep trailing reasoning as a separate singleton when no research follows', () => {
      const parts: Parts = [grepPart(), grepPart(), reasoningPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(2);
      const aggregated = expectAggregated(groups[0]!);
      expect(aggregated.parts).toHaveLength(2);
      expect(aggregated.summaryDetail).toBe('2 searches');
      expect(groups[1]!.kind).toBe('singleton');
      if (groups[1]!.kind === 'singleton') {
        expect(groups[1]!.category).toBe('reasoning');
      }
    });

    it('should absorb only sandwiched reasoning, leaving leading and trailing reasoning as singletons', () => {
      const parts: Parts = [reasoningPart('a'), grepPart(), reasoningPart('b'), grepPart(), reasoningPart('c')];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      expect(groups[0]!.kind).toBe('singleton');
      if (groups[0]!.kind === 'singleton') {
        expect(groups[0]!.category).toBe('reasoning');
        expect(groups[0]!.partIndex).toBe(0);
      }
      const aggregated = expectAggregated(groups[1]!);
      expect(aggregated.parts).toHaveLength(3);
      expect(aggregated.parts[1]!.type).toBe('reasoning');
      expect(aggregated.partIndices).toEqual([1, 2, 3]);
      expect(aggregated.summaryDetail).toBe('2 searches');
      expect(groups[2]!.kind).toBe('singleton');
      if (groups[2]!.kind === 'singleton') {
        expect(groups[2]!.category).toBe('reasoning');
        expect(groups[2]!.partIndex).toBe(4);
      }
    });

    it('should not bridge across non-bridging singletons (write breaks the bridge)', () => {
      const parts: Parts = [grepPart(), editFilePart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      const first = expectAggregated(groups[0]!);
      expect(first.parts).toHaveLength(1);
      expect(groups[1]!.kind).toBe('singleton');
      if (groups[1]!.kind === 'singleton') {
        expect(groups[1]!.category).toBe('write');
      }
      const third = expectAggregated(groups[2]!);
      expect(third.parts).toHaveLength(1);
    });

    it('should bridge reasoning across CAD verification tools (kernel/test/screenshot) into one aggregated research group', () => {
      const parts: Parts = [
        reasoningPart('R-lead'),
        kernelResultPart(),
        reasoningPart('R-mid-1'),
        testModelPartWithCounts(2, 2),
        reasoningPart('R-mid-2'),
        compositeScreenshotPart(),
        reasoningPart('R-trail'),
      ];
      const groups = groupAssistantParts(parts);

      // Leading + aggregated + trailing reasoning singleton (per peel-at-flush semantics).
      expect(groups).toHaveLength(3);

      const leading = groups[0]!;
      expect(leading.kind).toBe('singleton');
      if (leading.kind === 'singleton') {
        expect(leading.category).toBe('reasoning');
        expect(leading.partIndex).toBe(0);
      }

      const aggregated = expectAggregated(groups[1]!);
      expect(aggregated.category).toBe('research');
      expect(aggregated.parts).toHaveLength(5);
      expect(aggregated.parts.map((p) => p.type)).toEqual([
        'tool-get_kernel_result',
        'reasoning',
        'tool-test_model',
        'reasoning',
        'tool-screenshot',
      ]);
      expect(aggregated.partIndices).toEqual([1, 2, 3, 4, 5]);
      expect(aggregated.summary).toBe('Explored 1 render, 6 screenshots, 4 tests');

      const trailing = groups[2]!;
      expect(trailing.kind).toBe('singleton');
      if (trailing.kind === 'singleton') {
        expect(trailing.category).toBe('reasoning');
        expect(trailing.partIndex).toBe(6);
      }

      // The full sequence collapses into a single foldable run for ChatActivitySection.
      const runs = partitionActivityRuns(groups);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.kind).toBe('foldable-run');
      if (runs[0]!.kind === 'foldable-run') {
        expect(runs[0]!.groups).toHaveLength(3);
        expect(runs[0]!.startIndex).toBe(0);
      }
    });

    it('should not bridge across reasoning followed by a non-research part', () => {
      const parts: Parts = [grepPart(), reasoningPart(), editFilePart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      const aggregated = expectAggregated(groups[0]!);
      expect(aggregated.parts).toHaveLength(1);
      expect(groups[1]!.kind).toBe('singleton');
      if (groups[1]!.kind === 'singleton') {
        expect(groups[1]!.category).toBe('reasoning');
      }
      expect(groups[2]!.kind).toBe('singleton');
      if (groups[2]!.kind === 'singleton') {
        expect(groups[2]!.category).toBe('write');
      }
    });

    it('should compute summary detail from research parts only (reasoning excluded)', () => {
      const parts: Parts = [grepPart(), reasoningPart(), webSearchPart(), webBrowserPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(1);
      const group = expectAggregated(groups[0]!);
      expect(group.summaryDetail).toBe('2 searches, 1 fetch');
      expect(group.summary).toBe('Explored 2 searches, 1 fetch');
    });

    it('should keep leading reasoning when the research run is a single part', () => {
      const parts: Parts = [reasoningPart(), grepPart()];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(2);
      expect(groups[0]!.kind).toBe('singleton');
      const aggregated = expectAggregated(groups[1]!);
      expect(aggregated.parts).toHaveLength(1);
    });

    it('should keep multiple consecutive trailing reasoning parts as singletons', () => {
      const parts: Parts = [grepPart(), reasoningPart('a'), reasoningPart('b')];
      const groups = groupAssistantParts(parts);

      expect(groups).toHaveLength(3);
      const aggregated = expectAggregated(groups[0]!);
      expect(aggregated.parts).toHaveLength(1);
      expect(groups[1]!.kind).toBe('singleton');
      if (groups[1]!.kind === 'singleton') {
        expect(groups[1]!.category).toBe('reasoning');
      }
      expect(groups[2]!.kind).toBe('singleton');
      if (groups[2]!.kind === 'singleton') {
        expect(groups[2]!.category).toBe('reasoning');
      }
    });
  });

  describe('findLastMeaningfulPartIndex', () => {
    it('should return -1 for an empty parts array', () => {
      expect(findLastMeaningfulPartIndex([])).toBe(-1);
    });

    it('should return -1 when every part classifies as skip', () => {
      const parts: Parts = [stepStartPart(), { type: 'data-usage', data: {} } as unknown as Part];
      expect(findLastMeaningfulPartIndex(parts)).toBe(-1);
    });

    it('should skip trailing data-usage / step-start / empty-text parts and return the last meaningful index', () => {
      const parts: Parts = [
        reasoningPart(),
        webSearchPart(),
        { type: 'data-usage', data: {} } as unknown as Part,
        stepStartPart(),
      ];
      expect(findLastMeaningfulPartIndex(parts)).toBe(1);
    });

    it('should return the index of a trailing reasoning part', () => {
      const parts: Parts = [webSearchPart(), reasoningPart()];
      expect(findLastMeaningfulPartIndex(parts)).toBe(1);
    });

    it('should return the index of a trailing web_search (screenshot scenario)', () => {
      const parts: Parts = [reasoningPart(), webSearchPart(), webSearchPart(), webSearchPart(), webSearchPart()];
      expect(findLastMeaningfulPartIndex(parts)).toBe(4);
    });

    it('should treat whitespace-only text as skip and ignore it for the last index', () => {
      const parts: Parts = [reasoningPart(), webSearchPart(), textPart('   \n\t')];
      expect(findLastMeaningfulPartIndex(parts)).toBe(1);
    });

    it('should return the last index when all parts are meaningful', () => {
      const parts: Parts = [reasoningPart(), webSearchPart(), textPart('Answer')];
      expect(findLastMeaningfulPartIndex(parts)).toBe(2);
    });
  });

  describe('summary generation', () => {
    it('should generate research summary for explore-only tools (files + searches)', () => {
      const parts: Parts = [readFilePart(), readFilePart(), grepPart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryVerbPast).toBe('Explored');
      expect(group.summaryDetail).toBe('2 files, 1 search');
      expect(group.summary).toBe('Explored 2 files, 1 search');
    });

    it('should generate research summary for web-only tools (searches + fetches)', () => {
      const parts: Parts = [webSearchPart(), webSearchPart(), webBrowserPart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryVerbPast).toBe('Explored');
      expect(group.summaryDetail).toBe('2 searches, 1 fetch');
      expect(group.summary).toBe('Explored 2 searches, 1 fetch');
    });

    it('should merge web + code searches into a single searches count', () => {
      const parts: Parts = [webSearchPart(), webSearchPart(), readFilePart(), grepPart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryVerbPast).toBe('Explored');
      expect(group.summaryDetail).toBe('1 file, 3 searches');
      expect(group.summary).toBe('Explored 1 file, 3 searches');
    });

    it('should produce singular forms when count is 1 for each segment', () => {
      const parts: Parts = [webSearchPart(), webBrowserPart(), readFilePart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryVerbPast).toBe('Explored');
      expect(group.summaryDetail).toBe('1 file, 1 search, 1 fetch');
      expect(group.summary).toBe('Explored 1 file, 1 search, 1 fetch');
    });

    it('should pluralize each segment when count is greater than 1', () => {
      const parts: Parts = [
        webSearchPart(),
        webSearchPart(),
        webBrowserPart(),
        webBrowserPart(),
        readFilePart(),
        readFilePart(),
        grepPart(),
        grepPart(),
      ];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryVerbPast).toBe('Explored');
      expect(group.summaryDetail).toBe('2 files, 4 searches, 2 fetches');
      expect(group.summary).toBe('Explored 2 files, 4 searches, 2 fetches');
    });

    it('should order segments as files, searches, fetches', () => {
      const parts: Parts = [webBrowserPart(), grepPart(), readFilePart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryDetail).toBe('1 file, 1 search, 1 fetch');
    });

    it('should always satisfy the invariant: summary equals summaryVerbPast + space + summaryDetail', () => {
      const fixtures: Parts[] = [
        [readFilePart()],
        [webSearchPart(), webBrowserPart()],
        [readFilePart(), webSearchPart(), grepPart()],
      ];

      for (const parts of fixtures) {
        const groups = groupAssistantParts(parts);
        const group = expectAggregated(groups[0]!);
        expect(group.summary).toBe(`${group.summaryVerbPast} ${group.summaryDetail}`);
      }
    });

    it('should count a single get_kernel_result call as 1 render', () => {
      const groups = groupAssistantParts([kernelResultPart()]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 render');
    });

    it('should pluralize renders when there are multiple kernel checks', () => {
      const groups = groupAssistantParts([kernelResultPart(), kernelResultPart(), kernelResultPart()]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 3 renders');
    });

    it('should count actual screenshot images returned by output-available calls', () => {
      const parts: Parts = [
        screenshotPartWithImages([
          { view: 'front', dataUrl: 'data:image/png;base64,AAAA' },
          { view: 'top', dataUrl: 'data:image/png;base64,BBBB' },
        ]),
      ];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 2 screenshots');
    });

    it('should expand a composite multi-angle screenshot to 6 screenshots', () => {
      const groups = groupAssistantParts([compositeScreenshotPart()]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 6 screenshots');
    });

    it('should sum image counts across multiple screenshot calls (composite + single)', () => {
      const parts: Parts = [
        compositeScreenshotPart(),
        screenshotPartWithImages([{ view: 'current', dataUrl: 'data:image/png;base64,CCCC' }]),
      ];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 7 screenshots');
    });

    it('should contribute a 1-image streaming placeholder for screenshots before output is available', () => {
      const groups = groupAssistantParts([screenshotPart('input-streaming')]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 screenshot');
    });

    it('should count test cases as passes + failures from test_model output', () => {
      const groups = groupAssistantParts([testModelPartWithCounts(2, 1)]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 3 tests');
    });

    it('should omit the tests segment entirely when test_model is still streaming', () => {
      const groups = groupAssistantParts([readFilePart(), testModelPart('input-streaming')]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 file');
    });

    it('should sum test counts across multiple test_model calls', () => {
      const parts: Parts = [testModelPartWithCounts(2, 0), testModelPartWithCounts(0, 3)];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 5 tests');
    });

    it('should produce the singular form "1 test"', () => {
      const groups = groupAssistantParts([testModelPartWithCounts(1, 0)]);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 test');
    });

    it('should emit segments in order files, searches, fetches, renders, screenshots, tests', () => {
      const parts: Parts = [
        webBrowserPart(),
        testModelPartWithCounts(2, 1),
        compositeScreenshotPart(),
        kernelResultPart(),
        grepPart(),
        readFilePart(),
      ];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 file, 1 search, 1 fetch, 1 render, 6 screenshots, 3 tests');
    });

    it('should produce the screenshot-scenario summary "Explored 1 render, 6 screenshots, 4 tests"', () => {
      const parts: Parts = [kernelResultPart(), testModelPartWithCounts(4, 0), compositeScreenshotPart()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summary).toBe('Explored 1 render, 6 screenshots, 4 tests');
    });

    it('should surface a (M cached) suffix alongside the files segment when M of N reads carry fileUnchangedMarker', async () => {
      const cachedRead = (): Part =>
        ({
          ...readFilePart(),
          state: 'output-available',
          output: {
            content: fileUnchangedMarker.build('tc_prior'),
            totalLines: 1,
          },
        }) as unknown as Part;
      const freshRead = (): Part =>
        ({
          ...readFilePart(),
          state: 'output-available',
          output: {
            content: '   1\thello\n',
            totalLines: 1,
          },
        }) as unknown as Part;

      const parts: Parts = [freshRead(), cachedRead(), cachedRead()];
      const groups = groupAssistantParts(parts);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryDetail).toBe('3 files (2 cached)');
      expect(group.summary).toBe('Explored 3 files (2 cached)');
    });

    it('should omit the cached suffix when no reads carry fileUnchangedMarker', () => {
      const groups = groupAssistantParts([readFilePart(), readFilePart()]);

      const group = expectAggregated(groups[0]!);
      expect(group.summaryDetail).toBe('2 files');
    });
  });
});

// ── isSectionFoldable ────────────────────────────────────────────────────────

describe('isSectionFoldable', () => {
  const singleton = (category: ActivityGroup['category']): ActivityGroup => ({
    kind: 'singleton',
    part: textPart(),
    partIndex: 0,
    category,
  });

  it('should return true for reasoning singletons', () => {
    expect(isSectionFoldable(singleton('reasoning'))).toBe(true);
  });

  it('should return true for aggregated research groups', () => {
    const groups = groupAssistantParts([readFilePart(), grepPart()]);
    expect(isSectionFoldable(groups[0]!)).toBe(true);
  });

  it('should return false for write singletons', () => {
    expect(isSectionFoldable(singleton('write'))).toBe(false);
  });

  it('should return false for transfer, data, and text singletons', () => {
    expect(isSectionFoldable(singleton('transfer'))).toBe(false);
    expect(isSectionFoldable(singleton('data'))).toBe(false);
    expect(isSectionFoldable(singleton('text'))).toBe(false);
  });
});

// ── partitionActivityRuns ────────────────────────────────────────────────────

describe('partitionActivityRuns', () => {
  it('should return an empty array for empty input', () => {
    expect(partitionActivityRuns([])).toEqual([]);
  });

  it('should coalesce reasoning + research into a single foldable run', () => {
    const groups = groupAssistantParts([reasoningPart(), readFilePart(), grepPart()]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(1);
    const foldable = expectFoldable(runs[0]!);
    expect(foldable.groups).toHaveLength(2);
    expect(foldable.startIndex).toBe(0);
  });

  it('should emit a single foldable run when the entire message is research', () => {
    const groups = groupAssistantParts([readFilePart(), grepPart(), webSearchPart()]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(1);
    const foldable = expectFoldable(runs[0]!);
    expect(foldable.groups).toHaveLength(1);
    expect(foldable.startIndex).toBe(0);
  });

  it('should emit standalone runs for consecutive write singletons (no foldable run)', () => {
    const groups = groupAssistantParts([editFilePart(), createFilePart()]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(2);
    expectStandalone(runs[0]!);
    expectStandalone(runs[1]!);
    expect((runs[0] as StandaloneRun).groupIndex).toBe(0);
    expect((runs[1] as StandaloneRun).groupIndex).toBe(1);
  });

  it('should split a foldable run when a write group breaks it', () => {
    const groups = groupAssistantParts([readFilePart(), editFilePart(), grepPart()]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(3);
    const first = expectFoldable(runs[0]!);
    expect(first.groups).toHaveLength(1);
    expect(first.startIndex).toBe(0);

    const middle = expectStandalone(runs[1]!);
    expect(middle.group.category).toBe('write');
    expect(middle.groupIndex).toBe(1);

    const third = expectFoldable(runs[2]!);
    expect(third.groups).toHaveLength(1);
    expect(third.startIndex).toBe(2);
  });

  it('should NOT split a foldable run when CAD verification tools are interleaved', () => {
    const groups = groupAssistantParts([readFilePart(), kernelResultPart(), grepPart()]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(1);
    const foldable = expectFoldable(runs[0]!);
    expect(foldable.groups).toHaveLength(1);
    expect(foldable.groups[0]!.kind).toBe('aggregated');
    expect(foldable.groups[0]!.category).toBe('research');
  });

  it('should handle the screenshot scenario: reasoning, research, write, research, write, text', () => {
    const groups = groupAssistantParts([
      reasoningPart(),
      readFilePart(),
      editFilePart(),
      grepPart(),
      createFilePart(),
      textPart('Final answer'),
    ]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(5);
    const first = expectFoldable(runs[0]!);
    expect(first.groups).toHaveLength(2);
    expect(first.startIndex).toBe(0);

    expect(expectStandalone(runs[1]!).group.category).toBe('write');
    const middleFoldable = expectFoldable(runs[2]!);
    expect(middleFoldable.groups).toHaveLength(1);
    expect(expectStandalone(runs[3]!).group.category).toBe('write');
    expect(expectStandalone(runs[4]!).group.category).toBe('text');
  });

  it('should emit text after a foldable run as a trailing standalone', () => {
    const groups = groupAssistantParts([readFilePart(), textPart('Answer')]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(2);
    expectFoldable(runs[0]!);
    const trailing = expectStandalone(runs[1]!);
    expect(trailing.group.category).toBe('text');
    expect(trailing.groupIndex).toBe(1);
  });

  it('should keep reasoning-only sequences in a single foldable run (renderer decides not to wrap)', () => {
    const groups = groupAssistantParts([reasoningPart('a'), reasoningPart('b')]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(1);
    const foldable = expectFoldable(runs[0]!);
    expect(foldable.groups).toHaveLength(2);
    expect(foldable.groups.every((g) => g.category === 'reasoning')).toBe(true);
  });

  it('should preserve absolute indices through standalone breaks', () => {
    const groups = groupAssistantParts([
      readFilePart(),
      editFilePart(),
      reasoningPart(),
      grepPart(),
      createFilePart(),
      webSearchPart(),
    ]);
    const runs = partitionActivityRuns(groups);

    // Groups: [research(0), write(1), reasoning(2)+research(3), write(4), research(5)]
    expect(runs).toHaveLength(5);
    expect(expectFoldable(runs[0]!).startIndex).toBe(0);
    expect(expectStandalone(runs[1]!).groupIndex).toBe(1);
    const middleFoldable = expectFoldable(runs[2]!);
    expect(middleFoldable.startIndex).toBe(2);
    expect(middleFoldable.groups).toHaveLength(2);
    expect(expectStandalone(runs[3]!).groupIndex).toBe(4);
    expect(expectFoldable(runs[4]!).startIndex).toBe(5);
  });

  it('should keep transfer and data singletons as standalones', () => {
    const groups = groupAssistantParts([
      readFilePart(),
      transferPart(),
      { type: 'data-context-compaction', data: {} } as unknown as Part,
      grepPart(),
    ]);
    const runs = partitionActivityRuns(groups);

    expect(runs).toHaveLength(4);
    expectFoldable(runs[0]!);
    expect(expectStandalone(runs[1]!).group.category).toBe('transfer');
    expect(expectStandalone(runs[2]!).group.category).toBe('data');
    expectFoldable(runs[3]!);
  });
});

// ── shouldWrapRun ────────────────────────────────────────────────────────────
//
// The wrap decision must be a function of the run's *identity* (does it
// contain an aggregate?) — never of its group count. Group counts oscillate
// per part because trailing reasoning is peeled at flush time, so any
// count-based predicate causes the outer `ChatActivitySection` to mount and
// unmount on every part arrival, resetting its open/close state and producing
// the visible "flip-flop" when the wrapper subscribes to group count.

describe('shouldWrapRun', () => {
  describe('truth table per run shape', () => {
    it('should wrap a foldable run containing a single aggregated research group', () => {
      expect(shouldWrapRun(firstFoldable([screenshotPart()]))).toBe(true);
    });

    it('should wrap a foldable run with leading reasoning followed by an aggregate', () => {
      expect(shouldWrapRun(firstFoldable([reasoningPart('lead'), screenshotPart()]))).toBe(true);
    });

    it('should wrap a foldable run with an aggregate followed by trailing reasoning', () => {
      expect(shouldWrapRun(firstFoldable([screenshotPart(), reasoningPart('tail')]))).toBe(true);
    });

    it('should wrap a foldable run with an aggregate sandwiched by reasoning on both sides', () => {
      expect(shouldWrapRun(firstFoldable([reasoningPart('lead'), screenshotPart(), reasoningPart('tail')]))).toBe(true);
    });

    it('should not wrap a foldable run consisting of a single reasoning singleton', () => {
      expect(shouldWrapRun(firstFoldable([reasoningPart()]))).toBe(false);
    });

    it('should not wrap a multi-reasoning foldable run with no aggregate', () => {
      expect(shouldWrapRun(firstFoldable([reasoningPart('a'), reasoningPart('b')]))).toBe(false);
    });
  });

  describe('streaming stability', () => {
    it('should stay wrapped once an aggregated group exists in the run, regardless of trailing reasoning peeling', () => {
      // Each step appends one part to simulate a streaming chunk; the foldable
      // run's `groups.length` deterministically oscillates between 1 and 2 as
      // trailing reasoning is alternately peeled (sandwich rule) and re-emitted
      // as a singleton. The wrap decision must remain `true` for every step
      // from the moment the first aggregate lands.
      const sequence: Parts[] = [
        [screenshotPart()],
        [screenshotPart(), reasoningPart('thought')],
        [screenshotPart(), reasoningPart('thought'), grepPart()],
        [screenshotPart(), reasoningPart('thought'), grepPart(), reasoningPart('thought2')],
        [screenshotPart(), reasoningPart('thought'), grepPart(), reasoningPart('thought2'), readFilePart()],
        [
          screenshotPart(),
          reasoningPart('thought'),
          grepPart(),
          reasoningPart('thought2'),
          readFilePart(),
          reasoningPart('thinking'),
        ],
      ];

      const decisions = sequence.map((parts, step) => ({
        step,
        groupCount: firstFoldable(parts).groups.length,
        wrapped: shouldWrapRun(firstFoldable(parts)),
      }));

      // Sanity check: confirm the count actually oscillates so this test
      // remains a meaningful guard against the count-based regression.
      const groupCounts = decisions.map((d) => d.groupCount);
      expect(groupCounts).toContain(1);
      expect(groupCounts).toContain(2);

      for (const decision of decisions) {
        expect(decision.wrapped, `step ${decision.step} (groupCount=${decision.groupCount}) should still wrap`).toBe(
          true,
        );
      }
    });

    it('should remain wrapped after the first aggregate lands in a previously reasoning-only run', () => {
      // Models the onset case where the user sees "Thinking..." first, then
      // research tools begin streaming. The wrap decision flips false → true
      // once and never flips back as more parts arrive in the same run.
      const sequence: Parts[] = [
        [reasoningPart('thinking')],
        [reasoningPart('thinking'), screenshotPart()],
        [reasoningPart('thinking'), screenshotPart(), grepPart()],
        [reasoningPart('thinking'), screenshotPart(), grepPart(), reasoningPart('more')],
        [reasoningPart('thinking'), screenshotPart(), grepPart(), reasoningPart('more'), readFilePart()],
      ];

      const wrapped = sequence.map((parts) => shouldWrapRun(firstFoldable(parts)));

      expect(wrapped[0]).toBe(false);
      for (let i = 1; i < wrapped.length; i++) {
        expect(wrapped[i], `step ${i} (post-first-aggregate) should wrap`).toBe(true);
      }
    });
  });

  describe('run-break unmount semantics', () => {
    it('should evaluate each foldable run independently when a non-foldable part splits the message', () => {
      // After a `text` part splits the partition, the trailing foldable run
      // is a fresh `FoldableRun` instance and must be evaluated on its own
      // contents — not inherit the wrap decision of the prior run. This
      // documents that `ChatActivitySection` unmounting at run boundaries is
      // intentional and load-bearing: the prior wrapped run's section unmounts,
      // and the new trailing reasoning-only run does not get wrapped.
      const groups = groupAssistantParts([
        screenshotPart(),
        grepPart(),
        textPart('Here is what I found'),
        reasoningPart('next thought'),
      ]);
      const runs = partitionActivityRuns(groups);

      expect(runs).toHaveLength(3);
      const leadingResearch = expectFoldable(runs[0]!);
      const splitter = expectStandalone(runs[1]!);
      const trailingReasoning = expectFoldable(runs[2]!);

      expect(splitter.group.category).toBe('text');
      expect(shouldWrapRun(leadingResearch)).toBe(true);
      expect(shouldWrapRun(trailingReasoning)).toBe(false);
    });

    it('should wrap each side independently when a non-foldable part splits two research runs', () => {
      const groups = groupAssistantParts([screenshotPart(), editFilePart(), grepPart()]);
      const runs = partitionActivityRuns(groups);

      expect(runs).toHaveLength(3);
      expect(shouldWrapRun(expectFoldable(runs[0]!))).toBe(true);
      expect(expectStandalone(runs[1]!).group.category).toBe('write');
      expect(shouldWrapRun(expectFoldable(runs[2]!))).toBe(true);
    });
  });
});
