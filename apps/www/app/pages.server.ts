import articles from '#content/articles.json';
import { validateArticles } from '#www/editorial.js';
import { pages } from '#www/pages.js';

export const publishedArticles = validateArticles(articles);
export const publicPaths = [
  ...pages.filter((page) => !page.error).map((page) => page.path),
  ...publishedArticles.map((article) => `/blog/${article.slug}/`),
];
