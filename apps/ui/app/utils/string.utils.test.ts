import { describe, expect, it } from 'vitest';
import { toTitleCase } from '#utils/string.utils.js';

describe('toTitleCase', () => {
  describe('basic camelCase conversion', () => {
    it('should convert camelCase to Title Case', () => {
      expect(toTitleCase('firstName')).toBe('First Name');
    });

    it('should convert PascalCase to Title Case', () => {
      expect(toTitleCase('FirstName')).toBe('First Name');
    });

    it('should convert multiple words in camelCase', () => {
      expect(toTitleCase('myVariableName')).toBe('My Variable Name');
    });
  });

  describe('snake_case conversion', () => {
    it('should convert snake_case to Title Case', () => {
      expect(toTitleCase('first_name')).toBe('First Name');
    });

    it('should convert multiple words in snake_case', () => {
      expect(toTitleCase('xml_http_request')).toBe('Xml Http Request');
    });

    it('should handle mixed case with underscores', () => {
      expect(toTitleCase('First_Name')).toBe('First Name');
    });
  });

  describe('kebab-case conversion', () => {
    it('should convert kebab-case to Title Case', () => {
      expect(toTitleCase('first-name')).toBe('First Name');
    });

    it('should convert multiple words in kebab-case', () => {
      expect(toTitleCase('my-variable-name')).toBe('My Variable Name');
    });
  });

  describe('acronyms and all caps', () => {
    it('should preserve all caps acronyms', () => {
      expect(toTitleCase('HTML')).toBe('HTML');
    });

    it('should preserve all caps words', () => {
      expect(toTitleCase('API')).toBe('API');
    });

    it('should handle consecutive uppercase letters', () => {
      expect(toTitleCase('HTTPResponse')).toBe('HTTPResponse');
    });
  });

  describe('numbers and digits', () => {
    it('should preserve numbers within words', () => {
      expect(toTitleCase('test123Name')).toBe('Test 123 Name');
    });

    it('should handle numbers at the start', () => {
      expect(toTitleCase('123test')).toBe('123 Test');
    });

    it('should handle numbers at the end', () => {
      expect(toTitleCase('test123')).toBe('Test 123');
    });

    it('should handle snake_case with numbers', () => {
      expect(toTitleCase('test_123_name')).toBe('Test 123 Name');
    });

    it('should handle camelCase with numbers', () => {
      expect(toTitleCase('api2Response')).toBe('Api 2 Response');
    });

    it('should handle multiple digit groups', () => {
      expect(toTitleCase('version2Point5')).toBe('Version 2 Point 5');
    });
  });

  describe('edge cases', () => {
    it('should handle single character', () => {
      expect(toTitleCase('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(toTitleCase('')).toBe('');
    });

    it('should handle single word', () => {
      expect(toTitleCase('test')).toBe('Test');
    });

    it('should handle already title case', () => {
      expect(toTitleCase('First Name')).toBe('First Name');
    });

    it('should handle multiple separators', () => {
      expect(toTitleCase('first__name')).toBe('First Name');
    });

    it('should handle mixed separators', () => {
      expect(toTitleCase('first_name-value')).toBe('First Name Value');
    });

    it('should trim extra whitespace', () => {
      expect(toTitleCase('  firstName  ')).toBe('First Name');
    });
  });

  describe('special characters', () => {
    it('should preserve special characters in the middle', () => {
      expect(toTitleCase('user@email')).toBe('User@ Email');
    });

    it('should handle mixed alphanumeric and symbols', () => {
      expect(toTitleCase('test_value@123')).toBe('Test Value@ 123');
    });
  });
});
