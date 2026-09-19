import { describe, expect, it } from 'vitest';
import { chatLabel, projectLabel } from '#routes/usage/activity-names.js';

const names = new Map([
  ['proj_gearbox', 'Gearbox'],
  ['proj_bracket', 'Motor bracket'],
]);

describe('projectLabel', () => {
  it('names the project the reader knows', () => {
    expect(projectLabel('proj_gearbox', names)).toBe('Gearbox');
  });

  it('never renders an id it cannot resolve', () => {
    const label = projectLabel('proj_deleted', names);

    expect(label).not.toContain('proj_deleted');
    expect(label).toBe('Project not available');
  });

  it('keeps spend with no project of its own apart from spend it cannot name', () => {
    expect(projectLabel(null, names)).toBe('Other Tau activity');
    expect(projectLabel(null, names)).not.toBe(projectLabel('proj_deleted', names));
  });

  it('resolves nothing when the listing never answered', () => {
    expect(projectLabel('proj_gearbox', new Map())).toBe('Project not available');
  });
});

describe('chatLabel', () => {
  it('says the spend belongs to a chat without naming it, and never by id', () => {
    const label = chatLabel('chat_01H9');

    expect(label).not.toContain('chat_01H9');
    expect(label).toBe('Chat name not available');
  });

  it('keeps spend with no chat at all on the existing label', () => {
    expect(chatLabel(null)).toBe('Other Tau activity');
  });
});
