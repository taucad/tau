import { describe, expect, it } from 'vitest';

describe('DOM text matching contract', () => {
  it('matches complete text, substrings and regular expressions without accepting unrelated text', () => {
    const element = document.createElement('div');
    element.textContent = 'prefix target suffix';
    expect(element).toMatchTextContent('prefix target suffix');
    expect(element).toMatchTextContent('target');
    expect(element).toMatchTextContent(/target/u);
    expect(element).not.toMatchTextContent('missing');
    expect(element).not.toMatchTextContent(/missing/u);
    expect(() => {
      expect(element).toMatchTextContent('missing');
    }).toThrow();
    expect(() => {
      expect(element).not.toMatchTextContent(/target/u);
    }).toThrow();
  });

  it('normalizes whitespace by default and honors explicit raw whitespace matching', () => {
    const element = document.createElement('div');
    element.textContent = '  first\n   second  ';
    expect(element).toMatchTextContent('first second');
    expect(element).toMatchTextContent(/first second/u);
    expect(element).toMatchTextContent('first\n   second', { normalizeWhitespace: false });
    expect(element).not.toMatchTextContent('first second', { normalizeWhitespace: false });
  });

  it('rejects an empty substring on nonempty content', () => {
    const element = document.createElement('div');
    element.textContent = 'content';
    expect(() => {
      expect(element).toMatchTextContent('');
    }).toThrow();
    element.textContent = '';
    expect(element).toMatchTextContent('');
  });
});
