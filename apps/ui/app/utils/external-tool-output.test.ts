import { describe, expect, it } from 'vitest';
import { externalToolOutputText } from '#utils/external-tool-output.js';

describe('external tool output text', () => {
  it('should decode Grok UTF-8 search and shell bytes without interpreting unrelated numeric arrays', () => {
    const bytes = [...new TextEncoder().encode('café.scad:2: cube(20);\n')];
    expect(externalToolOutputText({ type: 'GrepSearch', stdout: bytes, stderr: [] })).toBe('café.scad:2: cube(20);\n');
    expect(externalToolOutputText({ type: 'Bash', output: bytes })).toBe('café.scad:2: cube(20);\n');
    expect(externalToolOutputText({ output: bytes })).toBeUndefined();
    expect(externalToolOutputText({ type: 'Bash', output: [300, -1, 1.5] })).toBeUndefined();
    expect(externalToolOutputText({ type: 'Bash', output: [255] })).toBeUndefined();
  });

  it('should retain search errors and existing string outputs', () => {
    expect(
      externalToolOutputText({ type: 'GrepSearch', stdout: [], stderr: [...new TextEncoder().encode('missing path')] }),
    ).toBe('missing path');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex wire output key.
    expect(externalToolOutputText({ formatted_output: 'Codex output' })).toBe('Codex output');
    expect(externalToolOutputText({ output: 'Claude output' })).toBe('Claude output');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex wire output key.
    expect(externalToolOutputText({ formatted_output: ' ', output: 'Fallback output' })).toBe('Fallback output');
  });
});
