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
  it('names the chat once its project storage answered', () => {
    expect(chatLabel('chat_01H9', 'Bracket redesign')).toBe('Bracket redesign');
  });

  it('says it is looking rather than showing a name it does not have yet', () => {
    expect(chatLabel('chat_01H9', undefined)).toBe('Finding the chat…');
  });

  it('never falls back to the id when the chat is not on this device', () => {
    const label = chatLabel('chat_01H9', null);

    expect(label).not.toContain('chat_01H9');
    expect(label).toBe('Chat not on this device');
  });

  it('keeps spend with no chat at all on the existing label', () => {
    expect(chatLabel(null, undefined)).toBe('Other Tau activity');
    expect(chatLabel(null, null)).toBe('Other Tau activity');
  });
});
