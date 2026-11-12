import { describe, expect, it } from 'vitest';
import { chatExamples, exampleGoals, getRandomExamples } from '#constants/chat-prompt-examples.js';

describe('chatExamples', () => {
  it.each(exampleGoals)('should hold at least four %s examples', (goal) => {
    expect(chatExamples.filter(({ goals }) => goals.includes(goal)).length).toBeGreaterThanOrEqual(4);
  });

  it('should give every example a unique, kebab-case id', () => {
    const ids = chatExamples.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });

  it('should tag every example with at least one goal and name no kernel', () => {
    for (const example of chatExamples) {
      expect(example.goals.length).toBeGreaterThan(0);
      expect(Object.keys(example)).not.toContain('kernel');
    }
  });

  it('should need a circuit kernel for every electronics-only example', () => {
    const boards = chatExamples.filter(({ goals }) => goals.length === 1 && goals[0] === 'electronics');

    expect(boards.length).toBeGreaterThanOrEqual(4);
    expect(boards.every(({ needs }) => needs === 'electronics')).toBe(true);
  });
});

describe('getRandomExamples', () => {
  it('should draw only examples with no needs, since it has no kernel to check them against', () => {
    const drawn = getRandomExamples(chatExamples.length);

    expect(drawn.length).toBe(chatExamples.filter(({ needs }) => needs === undefined).length);
    expect(drawn.every(({ needs }) => needs === undefined)).toBe(true);
  });
});
