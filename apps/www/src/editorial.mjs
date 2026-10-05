/**
 * @typedef {object} PublishedArticle
 * @property {'published'} status - Explicit publication decision.
 * @property {'human'} authorship - Required editorial authorship declaration.
 * @property {string} author - Named author.
 * @property {string} reviewedBy - Named reviewer.
 * @property {string} date - ISO calendar date.
 * @property {string} slug - Safe URL segment.
 * @property {string} title - Article title.
 * @property {string} description - Article summary.
 * @property {string[]} paragraphs - Reviewed plain text.
 */

/** @type {(value: unknown) => value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @type {(value: unknown) => string} */
const requiredText = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Published articles require reviewed text and complete author metadata.');
  }
  return value;
};

/**
 * Publication is a human editorial action; metadata validation enforces completeness.
 * @internal
 * @param articles - Parsed editorial manifest.
 * @param now - Latest allowed publication date.
 * @returns Validated published articles.
 * @type {(articles: unknown, now?: Date) => PublishedArticle[]}
 */
export const validateArticles = (articles, now = new Date()) => {
  if (!Array.isArray(articles)) {
    throw new TypeError('Article manifest must be an array.');
  }
  /** @type {unknown[]} */
  const entries = articles;
  /** @type {PublishedArticle[]} */
  const published = [];
  const slugs = new Set();
  for (const article of entries) {
    if (!isRecord(article) || article['status'] !== 'published') {
      continue;
    }
    if (
      article['authorship'] !== 'human' ||
      !Array.isArray(article['paragraphs']) ||
      article['paragraphs'].length === 0
    ) {
      throw new Error('Published articles require human authorship and reviewed paragraphs.');
    }
    const author = requiredText(article['author']);
    const reviewedBy = requiredText(article['reviewedBy']);
    const date = requiredText(article['date']);
    const slug = requiredText(article['slug']);
    const title = requiredText(article['title']);
    const description = requiredText(article['description']);
    /** @type {unknown[]} */
    const paragraphEntries = article['paragraphs'];
    const paragraphs = paragraphEntries.map((paragraph) => requiredText(paragraph));
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      !/^[a-z\d]+(?:-[a-z\d]+)*$/u.test(slug)
    ) {
      throw new Error('Published articles require a valid date and safe slug.');
    }
    const publishedDate = new Date(date);
    if (publishedDate.toISOString().slice(0, 10) !== date || publishedDate > now) {
      throw new Error('Publication date must be a real date, not in the future.');
    }
    if (slugs.has(slug)) {
      throw new Error('Duplicate article slug.');
    }
    slugs.add(slug);
    published.push({
      status: 'published',
      authorship: 'human',
      author,
      reviewedBy,
      date,
      slug,
      title,
      description,
      paragraphs,
    });
  }
  return published;
};
