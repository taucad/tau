const processedMarkdownRequired = (): never => {
  throw new Error('Tau docs require Fumadocs includeProcessedMarkdown output.');
};

export const renderToMarkdown = processedMarkdownRequired;
export const asMarkdown = processedMarkdownRequired;
export const jsxComponents = {};
