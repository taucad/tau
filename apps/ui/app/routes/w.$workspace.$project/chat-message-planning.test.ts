import { describe, it, expect } from 'vitest';
import { areAllPartsConcluded } from '#routes/w.$workspace.$project/chat-message-planning.js';
import type { PartWithOptionalState } from '#routes/w.$workspace.$project/chat-message-planning.js';

describe('areAllPartsConcluded', () => {
  describe('empty parts array', () => {
    it('should return true for empty parts array', () => {
      const parts: PartWithOptionalState[] = [];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('parts without state property', () => {
    it('should return true when parts have no state property', () => {
      const parts: PartWithOptionalState[] = [{}, {}];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true for step-start parts (no state)', () => {
      const parts: PartWithOptionalState[] = [{}];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('text parts', () => {
    it('should return false when text is streaming', () => {
      const parts: PartWithOptionalState[] = [{ state: 'streaming' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return true when text is done', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true when text has undefined state', () => {
      const parts: PartWithOptionalState[] = [{ state: undefined }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('reasoning parts', () => {
    it('should return false when reasoning is streaming', () => {
      const parts: PartWithOptionalState[] = [{ state: 'streaming' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return true when reasoning is done', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('tool parts - input states', () => {
    it('should return false when tool is input-streaming', () => {
      const parts: PartWithOptionalState[] = [{ state: 'input-streaming' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return false when tool is input-available (executing)', () => {
      const parts: PartWithOptionalState[] = [{ state: 'input-available' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });
  });

  describe('tool parts - output states', () => {
    it('should return true when tool is output-available', () => {
      const parts: PartWithOptionalState[] = [{ state: 'output-available' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true when tool is output-error', () => {
      const parts: PartWithOptionalState[] = [{ state: 'output-error' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('mixed parts - all concluded', () => {
    it('should return true when text done + tool output-available', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'output-available' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true when reasoning done + text done + tool output-available', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'done' }, { state: 'output-available' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true when text (no state) + tool output-error', () => {
      const parts: PartWithOptionalState[] = [{}, { state: 'output-error' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('should return true with multiple concluded tools', () => {
      const parts: PartWithOptionalState[] = [
        { state: 'done' },
        { state: 'output-available' },
        { state: 'output-available' },
      ];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });

  describe('mixed parts - not concluded', () => {
    it('should return false when text streaming + tool done', () => {
      const parts: PartWithOptionalState[] = [{ state: 'streaming' }, { state: 'output-available' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return false when text done + tool executing', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'input-available' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return false when reasoning streaming + text done', () => {
      const parts: PartWithOptionalState[] = [{ state: 'streaming' }, { state: 'done' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('should return false when one tool is still processing among many', () => {
      const parts: PartWithOptionalState[] = [
        { state: 'done' },
        { state: 'output-available' },
        { state: 'input-available' },
        { state: 'output-available' },
      ];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('scenario: AI just sent user message, waiting for response', () => {
      // User message has no parts with state, so should be concluded
      const parts: PartWithOptionalState[] = [{}];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('scenario: AI is streaming initial response text', () => {
      const parts: PartWithOptionalState[] = [{ state: 'streaming' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('scenario: AI finished text, tool is executing', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'done' }, { state: 'input-available' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('scenario: tool completed, AI planning next move (should show indicator)', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'done' }, { state: 'output-available' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('scenario: AI streaming follow-up text after tool', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'output-available' }, { state: 'streaming' }];
      expect(areAllPartsConcluded(parts)).toBe(false);
    });

    it('scenario: multiple tool calls in sequence, all completed', () => {
      const parts: PartWithOptionalState[] = [
        { state: 'done' },
        { state: 'done' },
        { state: 'output-available' },
        { state: 'output-available' },
      ];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });

    it('scenario: tool failed, AI should plan error recovery', () => {
      const parts: PartWithOptionalState[] = [{ state: 'done' }, { state: 'output-error' }];
      expect(areAllPartsConcluded(parts)).toBe(true);
    });
  });
});
