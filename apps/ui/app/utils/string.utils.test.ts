import { describe, expect, it } from 'vitest';
import { toSnakeCase } from '#utils/string.utils.js';

describe('toSnakeCase', () => {
  it('should convert camelCase to snake_case', () => {
    expect(toSnakeCase('firstName')).toBe('first_name');
  });

  it('should convert PascalCase to snake_case', () => {
    expect(toSnakeCase('FirstName')).toBe('first_name');
  });

  it('should convert Title Case (spaces) to snake_case', () => {
    expect(toSnakeCase('First Name')).toBe('first_name');
  });

  it('should convert kebab-case to snake_case', () => {
    expect(toSnakeCase('first-name')).toBe('first_name');
  });

  it('should leave already snake_case unchanged', () => {
    expect(toSnakeCase('first_name')).toBe('first_name');
  });

  it('should convert Chat Transcript to chat_transcript (primary use case)', () => {
    expect(toSnakeCase('Chat Transcript')).toBe('chat_transcript');
  });

  it('should handle empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });
});
