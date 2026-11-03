import { describe, expect, it, vi } from 'vitest';
import { renderEditorDocumentation, typeScriptDocumentationMarkdown } from '#components/code/editor-documentation.js';

type Location = Readonly<{ uri: string; line: number; column: number }>;

function link(
  name: string,
  location: Location,
  text?: string,
): Array<{ text: string; kind: string; location?: Location }> {
  return [
    { text: '{@link ', kind: 'link' },
    { text: name, kind: 'linkName', location },
    ...(text ? [{ text, kind: 'linkText' }] : []),
    { text: '}', kind: 'link' },
  ];
}

describe('editor documentation', () => {
  it('keeps formatted documentation without loading images or executable markup', () => {
    const dom = renderEditorDocumentation(
      '**Shape** `size`\n\n![remote](https://example.com/track)\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
    );
    expect(dom.querySelector('strong')?.textContent).toBe('Shape');
    expect(dom.querySelector('code')?.textContent).toBe('size');
    expect(dom.querySelector('img, script, [href^="javascript:"]')).toBeNull();
  });

  it('opens external documentation links outside the editor', () => {
    const anchor = renderEditorDocumentation('[docs](https://x.dev)').querySelector('a');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders {@link} parts as definition links in the order TypeScript reports them', () => {
    const mechanism = { uri: 'file:///lib/mechanism.ts', line: 1, column: 1 };
    const gear = { uri: 'file:///gear.ts', line: 4, column: 3 };
    const documentation = typeScriptDocumentationMarkdown(
      [
        { text: 'identical to ', kind: 'text' },
        ...link('Mechanism', mechanism),
        { text: ' except ', kind: 'text' },
        ...link('Gear', gear, 'the gear'),
        { text: ', see ', kind: 'text' },
        { text: '{@link ', kind: 'link' },
        { text: 'https://x.dev docs', kind: 'linkText' },
        { text: '}', kind: 'link' },
      ],
      [
        {
          name: 'param',
          text: [
            { text: 'teeth', kind: 'parameterName' },
            { text: ' ', kind: 'space' },
            { text: 'count', kind: 'text' },
          ],
        },
        { name: 'see', text: [{ text: '', kind: 'text' }, ...link('Mechanism', mechanism)] },
      ],
    );
    expect(documentation.targets).toEqual([mechanism, gear, mechanism]);
    expect(documentation.markdown).toBe(
      'identical to [Mechanism](#tau-definition-0) except [the gear](#tau-definition-1), see [docs](https://x.dev)' +
        '\n\n*@param* `teeth` — count\n\n*@see* — [Mechanism](#tau-definition-2)',
    );

    const opened = vi.fn();
    const dom = renderEditorDocumentation(documentation.markdown, document, { onDefinitionLink: opened });
    const anchors = [...dom.querySelectorAll('a')];
    expect(anchors.map((anchor) => anchor.textContent)).toEqual(['Mechanism', 'the gear', 'docs', 'Mechanism']);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchors[1]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(opened).toHaveBeenCalledWith(1);
    anchors[3]!.click();
    expect(opened).toHaveBeenLastCalledWith(2);
  });

  it('keeps unresolved link names as plain text', () => {
    const documentation = typeScriptDocumentationMarkdown([
      { text: '{@link ', kind: 'link' },
      { text: 'Missing_name', kind: 'linkName' },
      { text: '}', kind: 'link' },
    ]);
    expect(documentation).toEqual({ markdown: String.raw`Missing\_name`, targets: [] });
  });
});
