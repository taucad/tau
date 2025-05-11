import type { ElementContent, Element, RootContent, Root } from 'hast';

export function starryNightGutter(tree: Root): Root {
  const replacement: RootContent[] = [];
  const search = /\r?\n|\r/g;
  let index = -1;
  let start = 0;
  let startTextRemainder = '';
  let lineNumber = 0;

  while (++index < tree.children.length) {
    const child = tree.children[index];

    if (child.type === 'text') {
      const textNode = child;
      let textStart = 0;
      let match = search.exec(textNode.value);

      while (match) {
        // Nodes in this line.
        const line = tree.children.slice(start, index) as ElementContent[];

        // Prepend text from a partial matched earlier text.
        if (startTextRemainder) {
          line.unshift({ type: 'text', value: startTextRemainder });
          startTextRemainder = '';
        }

        // Append text from this text.
        if (match.index > textStart) {
          line.push({
            type: 'text',
            value: textNode.value.slice(textStart, match.index),
          });
        }

        // Add a line, and the eol.
        lineNumber += 1;
        replacement.push(createLine(line, lineNumber), {
          type: 'text',
          value: match[0],
        });

        start = index + 1;
        textStart = match.index + match[0].length;
        match = search.exec(textNode.value);
      }

      // If we matched, make sure to not drop the text after the last line ending.
      if (start === index + 1) {
        startTextRemainder = textNode.value.slice(textStart);
      }
    }
  }

  const line = tree.children.slice(start) as ElementContent[];

  // Prepend text from a partial matched earlier text.
  if (startTextRemainder) {
    line.unshift({ type: 'text', value: startTextRemainder });
    startTextRemainder = '';
  }

  if (line.length > 0) {
    lineNumber += 1;
    replacement.push(createLine(line, lineNumber));
  }

  // Return a new tree instead of mutating the original
  return {
    ...tree,
    children: replacement,
  };
}

/**
 * @param {Array<ElementContent>} children
 * @param {number} line
 * @returns {Element}
 */
function createLine(children: ElementContent[], line: number): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: 'line', dataLineNumber: line },
    children,
  };
}
