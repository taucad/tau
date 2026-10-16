import { index, route } from '@react-router/dev/routes';
import type { RouteConfig } from '@react-router/dev/routes';
export default [
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  index('routes/home.tsx', { id: 'www-home' }),
  route('product', 'routes/product.tsx', { id: 'www-product' }),
  route('use-cases', 'routes/use-cases.tsx', { id: 'www-use-cases' }),
  route('use-cases/prototyping', 'routes/use-cases-prototyping.tsx', { id: 'www-use-cases-prototyping' }),
  route('use-cases/engineering', 'routes/use-cases-engineering.tsx', { id: 'www-use-cases-engineering' }),
  route('use-cases/learning', 'routes/use-cases-learning.tsx', { id: 'www-use-cases-learning' }),
  route('vision', 'routes/vision.tsx', { id: 'www-vision' }),
  route('pricing', 'routes/pricing.tsx', { id: 'www-pricing' }),
  route('contact', 'routes/contact.tsx', { id: 'www-contact' }),
  route('download', 'routes/download.tsx', { id: 'www-download' }),
  route('blog', 'routes/blog.tsx', { id: 'www-blog' }),
  route('privacy', 'routes/privacy.tsx', { id: 'www-privacy' }),
  route('legal', 'routes/legal.tsx', { id: 'www-legal' }),
  route('legal/:document', 'routes/legal-document.tsx', { id: 'www-legal-document' }),
  route('*', 'routes/page.tsx', { id: 'www-page' }),
] satisfies RouteConfig;
