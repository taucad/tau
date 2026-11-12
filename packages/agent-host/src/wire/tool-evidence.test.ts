import { describe, expect, it } from 'vitest';
import { tauToolKinds } from '#harness/tools.js';
import { externalToolName, tauToolEvidence } from '#wire/tool-evidence.js';

const evidenceClasses = new Set(['read', 'write', 'execute', 'geometry', 'verification', 'export', 'other']);

describe('tauToolEvidence', () => {
  it('should name every first-party tool with an evidence class, and only those', () => {
    expect([...tauToolEvidence.keys()].toSorted()).toEqual([...tauToolKinds.keys()].toSorted());
    for (const toolClass of tauToolEvidence.values()) {
      expect(evidenceClasses.has(toolClass)).toBe(true);
    }
  });

  it('should class the CAD tools by what they do to a design rather than as other', () => {
    expect(tauToolEvidence.get('read_file')).toBe('read');
    expect(tauToolEvidence.get('edit_file')).toBe('write');
    expect(tauToolEvidence.get('evaluate_model')).toBe('geometry');
    expect(tauToolEvidence.get('test_model')).toBe('verification');
    expect(tauToolEvidence.get('export_model')).toBe('export');
    expect(tauToolEvidence.get('shell')).toBe('execute');
  });

  it('should keep the name a tool outside the vocabulary is sent as apart from every first-party name', () => {
    expect(externalToolName).toBe('external-tool');
    expect(tauToolEvidence.has(externalToolName)).toBe(false);
  });
});
