/** Publication is a human editorial action; metadata validation only enforces completeness. */
export const validateArticles = (articles, now = new Date()) => {
  if (!Array.isArray(articles)) {
    throw new TypeError('Article manifest must be an array.');
  }
  const published = articles.filter((article) => article.status === 'published');
  const slugs = new Set();
  for (const article of published) {
    if (
      article.authorship !== 'human' ||
      !article.author?.trim() ||
      !article.reviewedBy?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(article.date) ||
      Number.isNaN(Date.parse(article.date)) ||
      !/^[a-z\d]+(?:-[a-z\d]+)*$/u.test(article.slug) ||
      !article.title ||
      !article.description ||
      !Array.isArray(article.paragraphs) ||
      article.paragraphs.length === 0 ||
      article.paragraphs.some((p) => typeof p !== 'string' || !p.trim())
    ) {
      throw new Error(
        'Published articles require human authorship, author, reviewer, date, safe slug and reviewed paragraphs.',
      );
    }
    const date = new Date(article.date);
    if (date.toISOString().slice(0, 10) !== article.date || date > now) {
      throw new Error('Publication date must be a real date, not in the future.');
    }
    if (slugs.has(article.slug)) {
      throw new Error('Duplicate article slug.');
    }
    slugs.add(article.slug);
  }
  return published;
};
