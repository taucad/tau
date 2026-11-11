import { describe, expect, test } from 'vitest';
import { loader, renderLegalDocument, slugify } from '#app/legal.server.js';
import { legalDocuments } from '#www/legal.js';

const load = (document: string): ReturnType<typeof loader> => {
  const url = new URL(`https://tau.new/legal/${document}/`);
  return loader({ params: { document }, request: new Request(url), url, pattern: '/legal/:document', context: {} });
};

describe('legal documents', () => {
  test.each(legalDocuments.map(({ slug }) => slug))(
    'should render %s with one page title and no body title',
    (slug) => {
      const { title, html } = renderLegalDocument(slug);
      expect(title.length).toBeGreaterThan(0);
      expect(html).not.toContain('<h1');
      expect(html).toContain('<h2 id="');
    },
  );

  test('should keep the heading anchors the app and emails link to', () => {
    const { html } = renderLegalDocument('privacy');
    expect(slugify('9.2.1 AI Service Improvement')).toBe('9.2.1-ai-service-improvement');
    expect(html).toContain('id="2-improving-tau-with-your-chats"');
    expect(html).toContain('id="10-marketing"');
  });

  test('should give the refund clause the stable anchor the Add credits dialog links to', () => {
    const { html } = renderLegalDocument('terms');
    expect(html).toContain('<p id="refunds"><strong>Refunds of top-ups.</strong>');
    expect(html.match(/id="refunds"/gu)).toHaveLength(1);
  });

  test('should let wide tables scroll inside a focusable region', () => {
    const { html } = renderLegalDocument('subprocessors');
    expect(html).toContain('<div class="table-scroll" tabindex="0"><table>');
    expect(html.match(/<table>/gu)?.length).toBe(html.match(/class="table-scroll"/gu)?.length);
  });

  test('should answer a missing document with a 404', () => {
    expect(() => load('missing')).toThrow(Response);
  });
});
