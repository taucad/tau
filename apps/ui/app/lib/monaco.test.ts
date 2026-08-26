import { describe, it, expect, vi } from 'vitest';
import { registerCompletion } from 'monacopilot';
import { registerCompletions } from '#lib/monaco.lib.client.js';
import type * as Monaco from 'monaco-editor';

vi.mock('monacopilot', () => ({ registerCompletion: vi.fn() }));

describe('registerCompletions', () => {
  it('should be a no-op while AI autocomplete is disabled', () => {
    const registration = registerCompletions({} as Monaco.editor.IStandaloneCodeEditor, {} as typeof Monaco);

    registration.trigger();
    registration.deregister();
    registration.updateOptions(() => ({}));

    expect(registerCompletion).not.toHaveBeenCalled();
  });
});
