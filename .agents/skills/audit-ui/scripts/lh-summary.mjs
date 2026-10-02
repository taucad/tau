#!/usr/bin/env node
// Parse one or more Lighthouse JSON reports and emit a markdown table.
// Usage: node lh-summary.mjs lh-*.report.json
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node lh-summary.mjs <lh-report.json> [more...]');
  process.exit(1);
}

const rows = [];
for (const file of files) {
  let lh;
  try {
    lh = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Skipping ${file}: ${e.message}`);
    continue;
  }
  const cats = lh.categories ?? {};
  const audits = lh.audits ?? {};
  const score = (k) => (cats[k]?.score == null ? 'n/a' : Math.round(cats[k].score * 100));
  const dv = (k) => audits[k]?.displayValue ?? 'n/a';
  rows.push({
    file: basename(file),
    url: lh.finalDisplayedUrl ?? lh.finalUrl ?? 'n/a',
    formFactor: lh.configSettings?.formFactor ?? 'n/a',
    perf: score('performance'),
    a11y: score('accessibility'),
    bp: score('best-practices'),
    seo: score('seo'),
    fcp: dv('first-contentful-paint'),
    lcp: dv('largest-contentful-paint'),
    tbt: dv('total-blocking-time'),
    cls: dv('cumulative-layout-shift'),
    tti: dv('interactive'),
    si: dv('speed-index'),
  });
}

const header = ['file', 'url', 'form', 'perf', 'a11y', 'bp', 'seo', 'FCP', 'LCP', 'TBT', 'CLS', 'TTI', 'SI'];
console.log('| ' + header.join(' | ') + ' |');
console.log('| ' + header.map(() => '---').join(' | ') + ' |');
for (const r of rows) {
  console.log(
    '| ' +
      [r.file, r.url, r.formFactor, r.perf, r.a11y, r.bp, r.seo, r.fcp, r.lcp, r.tbt, r.cls, r.tti, r.si].join(' | ') +
      ' |',
  );
}
