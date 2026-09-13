#!/usr/bin/env node
// Drive @axe-core/playwright across Tau target routes × viewports.
// Usage: node axe-audit.mjs [host]
// host defaults to https://taucad.dev — pass https://tau.new for production runs.
//
// Output:
//   axe-violations.json — full node list per rule, per URL, per viewport
//   axe-summary.json    — counts per rule/severity, per URL/viewport
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const HOST = process.argv[2] ?? 'https://taucad.dev';

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'docs-runtime', path: '/docs/runtime/' },
  { name: 'editor-new', path: '/projects/new?kernel=replicad' },
  { name: 'community', path: '/projects/community' },
];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1440, height: 900 },
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const browser = await chromium.launch();
const all = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  for (const route of ROUTES) {
    const url = HOST + route.path;
    const page = await ctx.newPage();
    let result = { route: route.name, viewport: vp.name, url, violations: [], error: null };
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
      const axeResults = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      result.violations = axeResults.violations;
    } catch (e) {
      result.error = e.message;
    } finally {
      await page.close();
    }
    all.push(result);
    const counts = countSeverity(result.violations);
    console.log(
      `[${vp.name}] ${url}\n  violations: ${result.violations.length} (crit=${counts.critical} serious=${counts.serious} mod=${counts.moderate} minor=${counts.minor})`,
    );
    for (const v of result.violations) {
      console.log(`    - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    }
  }
  await ctx.close();
}
await browser.close();

writeFileSync('axe-violations.json', JSON.stringify(all, null, 2));
const summary = all.map((r) => ({
  viewport: r.viewport,
  route: r.route,
  url: r.url,
  total: r.violations.length,
  ...countSeverity(r.violations),
}));
writeFileSync('axe-summary.json', JSON.stringify(summary, null, 2));

console.log('\n=== Summary ===');
console.table(summary);

function countSeverity(violations) {
  const out = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    if (out[v.impact] !== undefined) out[v.impact] += 1;
  }
  return out;
}
