/* oxlint-disable typescript/no-restricted-types -- The billing wire returns explicit JSON nulls; a fixture has to be able to say so. */
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

  /*
   * The listing starts after the table is already on screen, so "not answered
   * yet" is a state a reader sees. Calling it "not available" claims a settled
   * answer the page does not have.
   */
  it('says it is still looking while the listing is in flight', () => {
    expect(projectLabel('proj_gearbox', 'asking')).toBe('Finding the project…');
  });

  it('settles rather than looking forever when the page will never ask', () => {
    expect(projectLabel('proj_gearbox', 'unavailable')).toBe('Project not available');
  });

  it('keeps spend with no project of its own on its own label in every state', () => {
    expect(projectLabel(null, 'asking')).toBe('Other Tau activity');
    expect(projectLabel(null, 'unavailable')).toBe('Other Tau activity');
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
  const inProject = (chatHint: string | null): { projectHint: string | null; chatHint: string | null } => ({
    projectHint: 'proj_gearbox',
    chatHint,
  });

  it('names the chat once its project storage answered', () => {
    expect(chatLabel(inProject('chat_01H9'), 'Bracket redesign')).toBe('Bracket redesign');
  });

  it('says it is looking rather than showing a name it does not have yet', () => {
    expect(chatLabel(inProject('chat_01H9'), undefined)).toBe('Finding the chat…');
  });

  it('never falls back to the id when the chat is not on this device', () => {
    const label = chatLabel(inProject('chat_01H9'), null);

    expect(label).not.toContain('chat_01H9');
    expect(label).toBe('Chat not on this device');
  });

  /*
   * The two hints are produced independently (`chat.controller.ts` builds each
   * from its own request field), so a chat hint with no project hint exists —
   * and there is no project storage to look in. Saying the chat is absent would
   * be a verdict on a lookup that never happened.
   */
  it('does not claim the chat is absent when it had nowhere to look', () => {
    expect(chatLabel({ projectHint: null, chatHint: 'chat_01H9' }, null)).toBe('Chat name not available');
  });

  it('keeps spend with no chat at all on the existing label', () => {
    expect(chatLabel(inProject(null), undefined)).toBe('Other Tau activity');
    expect(chatLabel({ projectHint: null, chatHint: null }, null)).toBe('Other Tau activity');
  });
});
