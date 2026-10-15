export type PublishedArticle = {
  status: 'published';
  authorship: 'human';
  author: string;
  reviewedBy: string;
  date: string;
  slug: string;
  title: string;
  description: string;
  paragraphs: string[];
};

const isRecord: (value: unknown) => value is Record<string, unknown> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredText: (value: unknown) => string = (value): string => {
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
 */
export const validateArticles: (articles: unknown, now?: Date) => PublishedArticle[] = (
  articles,
  now = new Date(),
): PublishedArticle[] => {
  if (!Array.isArray(articles)) {
    throw new TypeError('Article manifest must be an array.');
  }

  const entries: unknown[] = articles;

  const published: PublishedArticle[] = [];
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

    const paragraphEntries: unknown[] = article['paragraphs'];
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
