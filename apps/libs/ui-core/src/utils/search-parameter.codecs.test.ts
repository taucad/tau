import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enumParameter, flagParameter, stringParameter } from '#utils/search-parameter.codecs.js';

const sectionSchema = z.enum(['general', 'models', 'billing']);
const sectionParameter = enumParameter(sectionSchema, 'general');

describe('search parameter codecs', () => {
  describe('stringParameter', () => {
    it('should parse the raw value and round-trip it', () => {
      const codec = stringParameter();

      expect(codec.parse('chat_42')).toBe('chat_42');
      expect(codec.serialize('chat_42')).toBe('chat_42');
      expect(codec.parse(codec.serialize('chat /+?&'))).toBe('chat /+?&');
    });

    it('should fall back when the parameter is absent', () => {
      expect(stringParameter().parse(undefined)).toBe('');
      expect(stringParameter('main').parse(undefined)).toBe('main');
    });

    it('should serialize the fallback to deletion', () => {
      expect(stringParameter().serialize('')).toBeUndefined();
      expect(stringParameter('main').serialize('main')).toBeUndefined();
      expect(stringParameter('main').serialize('next')).toBe('next');
    });
  });

  describe('flagParameter', () => {
    it('should read only the exact string 1 as true', () => {
      expect(flagParameter.parse('1')).toBe(true);
      expect(flagParameter.parse('0')).toBe(false);
      expect(flagParameter.parse('true')).toBe(false);
      expect(flagParameter.parse('')).toBe(false);
    });

    it('should fall back to false when the parameter is absent', () => {
      expect(flagParameter.parse(undefined)).toBe(false);
      expect(flagParameter.fallback).toBe(false);
    });

    it('should round-trip true and serialize false to deletion', () => {
      expect(flagParameter.serialize(true)).toBe('1');
      expect(flagParameter.parse(flagParameter.serialize(true))).toBe(true);
      expect(flagParameter.serialize(false)).toBeUndefined();
    });
  });

  describe('enumParameter', () => {
    it('should parse a value the schema accepts', () => {
      expect(sectionParameter.parse('models')).toBe('models');
      expect(sectionParameter.serialize('models')).toBe('models');
      expect(sectionParameter.parse(sectionParameter.serialize('billing'))).toBe('billing');
    });

    it('should degrade to the fallback instead of throwing when the value is outside the schema', () => {
      expect(sectionParameter.parse('api-keys')).toBe('general');
      expect(sectionParameter.parse('')).toBe('general');
      expect(sectionParameter.parse(undefined)).toBe('general');
    });

    it('should serialize the fallback to deletion', () => {
      expect(sectionParameter.serialize('general')).toBeUndefined();
    });
  });
});
