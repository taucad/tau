import { describe, it, expect, vi } from 'vitest';
import { createSectionRegistry } from '#api/chat/prompts/prompt-section-registry.js';

describe('createSectionRegistry', () => {
  it('should register and resolve static sections into static output', () => {
    const registry = createSectionRegistry();
    registry.register({ name: 'role', compute: () => '<role>You are Tau</role>', cacheBreak: false });
    const { static: staticPrompt } = registry.resolve();
    expect(staticPrompt).toContain('<role>You are Tau</role>');
  });

  it('should register and resolve dynamic sections into dynamic output', () => {
    const registry = createSectionRegistry();
    registry.register({
      name: 'environment',
      compute: () => '<environment>Model: gpt-test</environment>',
      cacheBreak: true,
    });
    const { dynamic } = registry.resolve();
    expect(dynamic).toContain('<environment>Model: gpt-test</environment>');
  });

  it('should partition sections by cacheBreak flag', () => {
    const registry = createSectionRegistry();
    registry.register({ name: 'role', compute: () => 'STATIC_CONTENT', cacheBreak: false });
    registry.register({ name: 'workflow', compute: () => 'ALSO_STATIC', cacheBreak: false });
    registry.register({ name: 'env', compute: () => 'DYNAMIC_CONTENT', cacheBreak: true });
    registry.register({ name: 'git', compute: () => 'ALSO_DYNAMIC', cacheBreak: true });

    const { static: staticPrompt, dynamic } = registry.resolve();

    expect(staticPrompt).toContain('STATIC_CONTENT');
    expect(staticPrompt).toContain('ALSO_STATIC');
    expect(staticPrompt).not.toContain('DYNAMIC_CONTENT');
    expect(staticPrompt).not.toContain('ALSO_DYNAMIC');

    expect(dynamic).toContain('DYNAMIC_CONTENT');
    expect(dynamic).toContain('ALSO_DYNAMIC');
    expect(dynamic).not.toContain('STATIC_CONTENT');
    expect(dynamic).not.toContain('ALSO_STATIC');
  });

  it('should preserve section registration order', () => {
    const registry = createSectionRegistry();
    registry.register({ name: 'first', compute: () => 'AAA', cacheBreak: false });
    registry.register({ name: 'second', compute: () => 'BBB', cacheBreak: false });
    registry.register({ name: 'third', compute: () => 'CCC', cacheBreak: false });

    const { static: staticPrompt } = registry.resolve();
    const aIndex = staticPrompt.indexOf('AAA');
    const bIndex = staticPrompt.indexOf('BBB');
    const cIndex = staticPrompt.indexOf('CCC');
    expect(aIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(cIndex);
  });

  it('should allow invalidating a section by name', () => {
    const registry = createSectionRegistry();
    let counter = 0;
    registry.register({ name: 'counter', compute: () => `count=${counter}`, cacheBreak: false });

    const first = registry.resolve();
    expect(first.static).toContain('count=0');

    counter = 1;
    registry.invalidate('counter');

    const second = registry.resolve();
    expect(second.static).toContain('count=1');
  });

  it('should return empty strings when no sections registered', () => {
    const registry = createSectionRegistry();
    const { static: staticPrompt, dynamic } = registry.resolve();
    expect(staticPrompt).toBe('');
    expect(dynamic).toBe('');
  });

  it('should skip empty section outputs', () => {
    const registry = createSectionRegistry();
    registry.register({ name: 'empty', compute: () => '', cacheBreak: false });
    registry.register({ name: 'content', compute: () => 'visible', cacheBreak: false });

    const { static: staticPrompt } = registry.resolve();
    expect(staticPrompt).toBe('visible');
  });

  // ===================================================================
  // `onSectionResolved` callback for per-section telemetry. The chat
  // service wires this to `MetricsService.genAiPromptSectionSize` so we
  // can see how many bytes each section contributes to the assembled
  // system prompt and which sections break the cache.
  // ===================================================================

  describe('onSectionResolved telemetry callback', () => {
    it('should invoke onSectionResolved once per non-empty section with name, cacheBreak and byteSize', () => {
      const registry = createSectionRegistry();
      registry.register({ name: 'role', compute: () => 'STATIC_ROLE', cacheBreak: false });
      registry.register({ name: 'env', compute: () => 'DYN_ENV', cacheBreak: true });

      const onSectionResolved = vi.fn();

      registry.resolve({ onSectionResolved });

      expect(onSectionResolved).toHaveBeenCalledTimes(2);
      expect(onSectionResolved).toHaveBeenCalledWith({
        name: 'role',
        cacheBreak: false,
        byteSize: Buffer.byteLength('STATIC_ROLE', 'utf8'),
      });
      expect(onSectionResolved).toHaveBeenCalledWith({
        name: 'env',
        cacheBreak: true,
        byteSize: Buffer.byteLength('DYN_ENV', 'utf8'),
      });
    });

    it('should NOT invoke onSectionResolved for sections whose compute() returns empty', () => {
      const registry = createSectionRegistry();
      registry.register({ name: 'empty', compute: () => '', cacheBreak: false });
      registry.register({ name: 'content', compute: () => 'hi', cacheBreak: false });

      const onSectionResolved = vi.fn();

      registry.resolve({ onSectionResolved });

      expect(onSectionResolved).toHaveBeenCalledTimes(1);
      expect(onSectionResolved).toHaveBeenCalledWith({
        name: 'content',
        cacheBreak: false,
        byteSize: Buffer.byteLength('hi', 'utf8'),
      });
    });

    it('should report byte length (not character length) for multi-byte UTF-8 content', () => {
      const registry = createSectionRegistry();
      // "💡" is 4 bytes in UTF-8 but length 2 in JS strings (surrogate pair).
      const value = 'idea: 💡';
      registry.register({ name: 'utf8', compute: () => value, cacheBreak: false });

      const onSectionResolved = vi.fn();
      registry.resolve({ onSectionResolved });

      expect(onSectionResolved).toHaveBeenCalledWith({
        name: 'utf8',
        cacheBreak: false,
        byteSize: Buffer.byteLength(value, 'utf8'),
      });
    });

    it('should still invoke onSectionResolved on subsequent resolves (cached value reused, callback re-fires)', () => {
      const registry = createSectionRegistry();
      registry.register({ name: 'role', compute: () => 'STATIC', cacheBreak: false });

      const onSectionResolved = vi.fn();
      registry.resolve({ onSectionResolved });
      registry.resolve({ onSectionResolved });

      expect(onSectionResolved).toHaveBeenCalledTimes(2);
    });

    it('should be optional — resolve() works without options', () => {
      const registry = createSectionRegistry();
      registry.register({ name: 'role', compute: () => 'X', cacheBreak: false });

      expect(() => registry.resolve()).not.toThrow();
      expect(registry.resolve().static).toBe('X');
    });
  });
});
