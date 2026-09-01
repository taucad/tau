import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActivationContext, LanguageContribution, ActivationResult } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { LanguageContributionRegistry } from '#lib/monaco-language-registry.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';

function createMockContext(stub: MonacoTestStub): ActivationContext {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- registry only touches monaco; other fields are forwarded to contributions verbatim
  return {
    monaco: stub.monaco,
  } as unknown as ActivationContext;
}

function createMockContribution(
  languageId: string,
  overrides: Partial<LanguageContribution> = {},
): LanguageContribution {
  return {
    languageId,
    register: vi.fn(),
    activate: vi.fn<(context: ActivationContext) => ActivationResult>(() => ({
      disposables: [],
    })),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe('LanguageContributionRegistry', () => {
  let registry: LanguageContributionRegistry;
  let stub: MonacoTestStub;
  let context: ActivationContext;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = new LanguageContributionRegistry();
    stub = createMonacoTestStub();
    context = createMockContext(stub);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    registry.dispose();
    stub.__reset();
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-call -- vitest spy mock surface is dynamic
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('deferred activation', () => {
    it('should not call activate for a contribution whose activationLanguageIds have no models', () => {
      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });

      registry.addContribution(contrib);
      registry.activate(context);

      expect(contrib.activate).not.toHaveBeenCalled();
    });

    it('should call activate exactly once when the first matching model is created', () => {
      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });

      registry.addContribution(contrib);
      registry.activate(context);

      stub.__createModel('inmemory://a/0', 'lang-a');

      expect(contrib.activate).toHaveBeenCalledTimes(1);
      expect(contrib.activate).toHaveBeenCalledWith(context);
    });

    it('should call activate immediately when a matching model already exists at activate() time', () => {
      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });

      stub.__createModel('inmemory://a/preexisting', 'lang-a');

      registry.addContribution(contrib);
      registry.activate(context);

      expect(contrib.activate).toHaveBeenCalledTimes(1);
    });

    it('should call activate exactly once when multiple activationLanguageIds fire (e.g. ts/tsx/js/jsx)', () => {
      const contrib = createMockContribution('typescript', {
        activationLanguageIds: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
      });

      registry.addContribution(contrib);
      registry.activate(context);

      stub.__createModel('inmemory://t/0', 'typescript');
      stub.__createModel('inmemory://t/1', 'javascript');
      stub.__createModel('inmemory://t/2', 'typescriptreact');
      stub.__createModel('inmemory://t/3', 'javascriptreact');

      expect(contrib.activate).toHaveBeenCalledTimes(1);
    });

    it('should call activate independently per contribution when their language ids differ', () => {
      const kcl = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      const openscad = createMockContribution('openscad', { activationLanguageIds: ['openscad'] });

      registry.addContribution(kcl);
      registry.addContribution(openscad);
      registry.activate(context);

      stub.__createModel('inmemory://k/0', 'kcl');

      expect(kcl.activate).toHaveBeenCalledTimes(1);
      expect(openscad.activate).not.toHaveBeenCalled();

      stub.__createModel('inmemory://o/0', 'openscad');

      expect(openscad.activate).toHaveBeenCalledTimes(1);
    });

    it('should default activationLanguageIds to [languageId] when undefined', () => {
      const contrib = createMockContribution('lang-only');

      registry.addContribution(contrib);
      registry.activate(context);

      expect(contrib.activate).not.toHaveBeenCalled();

      stub.__createModel('inmemory://lo/0', 'lang-only');

      expect(contrib.activate).toHaveBeenCalledTimes(1);
    });

    it('should dispose onLanguage subscriptions when registry.dispose() runs before any model triggers them', () => {
      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });

      registry.addContribution(contrib);
      registry.activate(context);

      registry.dispose();

      stub.__createModel('inmemory://a/0', 'lang-a');

      expect(contrib.activate).not.toHaveBeenCalled();
    });

    it('should still log via console.error and continue when a deferred activate throws', () => {
      const broken = createMockContribution('lang-broken', {
        activationLanguageIds: ['lang-broken'],
        activate: vi.fn(() => {
          throw new Error('boom');
        }),
      });
      const stable = createMockContribution('lang-stable', { activationLanguageIds: ['lang-stable'] });

      registry.addContribution(broken);
      registry.addContribution(stable);
      registry.activate(context);

      stub.__createModel('inmemory://b/0', 'lang-broken');
      stub.__createModel('inmemory://s/0', 'lang-stable');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to activate language contribution "lang-broken":',
        expect.any(Error),
      );
      expect(stable.activate).toHaveBeenCalledTimes(1);
    });
  });

  describe('error reporting', () => {
    it('should invoke onActivationError with languageId and the thrown Error when activate throws', () => {
      const errorCallback = vi.fn();
      const errorRegistry = new LanguageContributionRegistry({ onActivationError: errorCallback });

      const broken = createMockContribution('lang-broken', {
        activationLanguageIds: ['lang-broken'],
        activate: vi.fn(() => {
          throw new Error('explosion');
        }),
      });

      errorRegistry.addContribution(broken);
      errorRegistry.activate(context);

      stub.__createModel('inmemory://b/0', 'lang-broken');

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith('lang-broken', expect.any(Error));
      const call = errorCallback.mock.calls[0]!;
      const errorArgument = call[1] as Error;
      expect(errorArgument.message).toBe('explosion');

      errorRegistry.dispose();
    });

    it('should still continue activating other contributions after onActivationError fires', () => {
      const errorCallback = vi.fn();
      const errorRegistry = new LanguageContributionRegistry({ onActivationError: errorCallback });

      const broken = createMockContribution('lang-broken', {
        activationLanguageIds: ['lang-broken'],
        activate: vi.fn(() => {
          throw new Error('explosion');
        }),
      });
      const stable = createMockContribution('lang-stable', { activationLanguageIds: ['lang-stable'] });

      errorRegistry.addContribution(broken);
      errorRegistry.addContribution(stable);
      errorRegistry.activate(context);

      stub.__createModel('inmemory://b/0', 'lang-broken');
      stub.__createModel('inmemory://s/0', 'lang-stable');

      expect(stable.activate).toHaveBeenCalledTimes(1);

      errorRegistry.dispose();
    });

    it('should accept a setActivationErrorHandler() override post-construction', () => {
      const callback = vi.fn();
      registry.setActivationErrorHandler(callback);

      const broken = createMockContribution('lang-broken', {
        activationLanguageIds: ['lang-broken'],
        activate: vi.fn(() => {
          throw new Error('boom');
        }),
      });

      registry.addContribution(broken);
      registry.activate(context);

      stub.__createModel('inmemory://b/0', 'lang-broken');

      expect(callback).toHaveBeenCalledWith('lang-broken', expect.any(Error));
    });
  });

  describe('performance marks', () => {
    it('should emit code/willActivateLanguage/<id> and code/didActivateLanguage/<id> marks around the synchronous activate body', () => {
      const markSpy = vi.fn();
      const measureSpy = vi.fn();
      vi.stubGlobal('performance', { mark: markSpy, measure: measureSpy });

      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });
      registry.addContribution(contrib);
      registry.activate(context);

      stub.__createModel('inmemory://a/0', 'lang-a');

      expect(markSpy).toHaveBeenNthCalledWith(1, 'code/willActivateLanguage/lang-a');
      expect(markSpy).toHaveBeenNthCalledWith(2, 'code/didActivateLanguage/lang-a');
      expect(measureSpy).toHaveBeenCalledWith(
        'code/activateLanguage/lang-a',
        'code/willActivateLanguage/lang-a',
        'code/didActivateLanguage/lang-a',
      );
    });

    it('should emit performance marks even when activate throws', () => {
      const markSpy = vi.fn();
      vi.stubGlobal('performance', { mark: markSpy, measure: vi.fn() });

      const broken = createMockContribution('lang-broken', {
        activationLanguageIds: ['lang-broken'],
        activate: vi.fn(() => {
          throw new Error('boom');
        }),
      });

      registry.addContribution(broken);
      registry.activate(context);

      stub.__createModel('inmemory://b/0', 'lang-broken');

      expect(markSpy).toHaveBeenCalledWith('code/willActivateLanguage/lang-broken');
      expect(markSpy).toHaveBeenCalledWith('code/didActivateLanguage/lang-broken');
    });
  });

  describe('prefetch', () => {
    it('should fire onLanguage exactly once per prefetched id', () => {
      const contrib = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      registry.addContribution(contrib);
      registry.activate(context);

      registry.prefetch(['kcl']);

      expect(contrib.activate).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent across multiple prefetch calls for the same id', () => {
      const contrib = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      registry.addContribution(contrib);
      registry.activate(context);

      const createSpy = vi.spyOn(stub.monaco.editor, 'createModel');

      registry.prefetch(['kcl']);
      registry.prefetch(['kcl']);
      registry.prefetch(['kcl']);

      expect(contrib.activate).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should activate the contribution gated on a prefetched id even when no real model exists', () => {
      const contrib = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      registry.addContribution(contrib);
      registry.activate(context);

      expect(contrib.activate).not.toHaveBeenCalled();

      registry.prefetch(['kcl']);

      expect(contrib.activate).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op before activate() runs', () => {
      const contrib = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      registry.addContribution(contrib);

      expect(() => {
        registry.prefetch(['kcl']);
      }).not.toThrow();
      expect(contrib.activate).not.toHaveBeenCalled();
    });
  });

  describe('language-switch contract', () => {
    it('should activate kcl and typescript contributions exactly once when a model is created as kcl and then switched to typescript', () => {
      const kcl = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });
      const ts = createMockContribution('typescript', {
        activationLanguageIds: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
      });

      registry.addContribution(kcl);
      registry.addContribution(ts);
      registry.activate(context);

      const model = stub.__createModel('inmemory://m/0', 'kcl');
      expect(kcl.activate).toHaveBeenCalledTimes(1);
      expect(ts.activate).not.toHaveBeenCalled();

      model.__setLanguageForTest('typescript');

      expect(kcl.activate).toHaveBeenCalledTimes(1);
      expect(ts.activate).toHaveBeenCalledTimes(1);
    });

    it('should not re-activate kcl when a second .kcl model is created', () => {
      const kcl = createMockContribution('kcl', { activationLanguageIds: ['kcl'] });

      registry.addContribution(kcl);
      registry.activate(context);

      stub.__createModel('inmemory://k/0', 'kcl');
      stub.__createModel('inmemory://k/1', 'kcl');

      expect(kcl.activate).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle preservation', () => {
    it('should re-activate after project session change even if previous activation had errors', () => {
      let shouldThrow = true;
      const contribFlaky = createMockContribution('lang-flaky', {
        activationLanguageIds: ['lang-flaky'],
        activate: vi.fn(() => {
          if (shouldThrow) {
            throw new Error('temporary failure');
          }
          return {
            disposables: [],
          };
        }),
      });

      registry.addContribution(contribFlaky);
      registry.activate(context);

      stub.__createModel('inmemory://f/0', 'lang-flaky');
      expect(contribFlaky.activate).toHaveBeenCalledTimes(1);

      shouldThrow = false;
      registry.onProjectSessionChange('project-2');

      registry.activate(context);
      stub.__createModel('inmemory://f/1', 'lang-flaky');

      expect(contribFlaky.activate).toHaveBeenCalledTimes(2);
    });

    it('should early-return when activate() is called twice in the same epoch', () => {
      const onLanguageSpy = vi.spyOn(stub.monaco.languages, 'onLanguage');
      const contrib = createMockContribution('lang-a', { activationLanguageIds: ['lang-a'] });
      registry.addContribution(contrib);

      registry.activate(context);
      const afterFirst = onLanguageSpy.mock.calls.length;
      registry.activate(context);
      expect(onLanguageSpy.mock.calls.length).toBe(afterFirst);
    });

    it('should not re-register contributions on subsequent registerAll calls', () => {
      const contrib = createMockContribution('lang-a');
      registry.addContribution(contrib);

      registry.registerAll(stub.monaco);
      registry.registerAll(stub.monaco);

      expect(contrib.register).toHaveBeenCalledTimes(1);
    });
  });
});
