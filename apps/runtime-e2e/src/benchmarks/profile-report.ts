/**
 * CPU Profile Report Generator
 *
 * Generates self-contained HTML reports from CPU profile analysis results.
 * Includes category donut charts, top-N function tables, telemetry span
 * summaries, and inline .cpuprofile download links.
 * No external dependencies -- everything is inlined.
 */

import type { CpuProfile } from '#benchmarks/cpu-profiler.js';
import type { ProfileAnalysis, FunctionTiming, CategoryBreakdown, SpanSummary } from '#benchmarks/profile-analyzer.js';
import { getCategoryColor, allCategories } from '#benchmarks/profile-analyzer.js';

// =============================================================================
// Helpers
// =============================================================================

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatUs(us: number): string {
  if (us < 1000) {
    return `${us.toFixed(0)}us`;
  }

  const ms = us / 1000;
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMs(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}us`;
  }

  return `${ms.toFixed(2)}ms`;
}

function formatPct(value: number, total: number): string {
  if (total === 0) {
    return '0.0%';
  }

  return `${((value / total) * 100).toFixed(1)}%`;
}

function shortenUrl(url: string): string {
  const packagesIndex = url.indexOf('packages/');
  if (packagesIndex !== -1) {
    return url.slice(packagesIndex);
  }

  const nodeModulesIndex = url.indexOf('node_modules/');
  if (nodeModulesIndex !== -1) {
    return url.slice(nodeModulesIndex);
  }

  const sourceIndex = url.indexOf('src/');
  if (sourceIndex !== -1) {
    return url.slice(sourceIndex);
  }

  if (url.length > 60) {
    return `...${url.slice(-57)}`;
  }

  return url;
}

// =============================================================================
// SVG Donut Chart
// =============================================================================

function generateDonutChart(breakdown: CategoryBreakdown, totalUs: number): string {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 85;
  const innerR = 55;

  const activeCategories = allCategories.filter((cat) => breakdown[cat] > 0);
  if (activeCategories.length === 0) {
    return '';
  }

  let paths = '';
  let cumulativeAngle = -Math.PI / 2;

  for (const category of activeCategories) {
    const fraction = breakdown[category] / totalUs;
    const angle = fraction * 2 * Math.PI;

    if (angle < 0.001) {
      continue;
    }

    const largeArc = angle > Math.PI ? 1 : 0;
    const x1Outer = cx + outerR * Math.cos(cumulativeAngle);
    const y1Outer = cy + outerR * Math.sin(cumulativeAngle);
    const x2Outer = cx + outerR * Math.cos(cumulativeAngle + angle);
    const y2Outer = cy + outerR * Math.sin(cumulativeAngle + angle);
    const x1Inner = cx + innerR * Math.cos(cumulativeAngle + angle);
    const y1Inner = cy + innerR * Math.sin(cumulativeAngle + angle);
    const x2Inner = cx + innerR * Math.cos(cumulativeAngle);
    const y2Inner = cy + innerR * Math.sin(cumulativeAngle);

    const color = getCategoryColor(category);
    paths += `<path d="M ${x1Outer} ${y1Outer} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z" fill="${color}"/>`;

    cumulativeAngle += angle;
  }

  const centerText = `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="14" font-weight="700" fill="#1F2937">${formatUs(totalUs)}</text>`;
  const subText = `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#6B7280">total</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}${centerText}${subText}</svg>`;
}

function generateLegend(breakdown: CategoryBreakdown, totalUs: number): string {
  let html = '<div class="legend">';
  for (const category of allCategories) {
    const value = breakdown[category];
    if (value === 0) {
      continue;
    }

    const color = getCategoryColor(category);
    const pct = formatPct(value, totalUs);
    html += `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span class="legend-label">${escapeHtml(category)}</span><span class="legend-value">${formatUs(value)} (${pct})</span></div>`;
  }

  html += '</div>';
  return html;
}

// =============================================================================
// Tables
// =============================================================================

function generateFunctionTable(functions: FunctionTiming[], totalUs: number, limit = 30): string {
  const top = functions.slice(0, limit);

  let rows = '';
  for (const timing of top) {
    const color = getCategoryColor(timing.category);
    const selfPct = formatPct(timing.selfTimeUs, totalUs);
    const totalPct = formatPct(timing.totalTimeUs, totalUs);
    const location = timing.url ? `${shortenUrl(timing.url)}:${timing.lineNumber + 1}` : '(native)';

    rows += `<tr>
      <td><span class="cat-dot" style="background:${color}"></span><code>${escapeHtml(timing.functionName)}</code></td>
      <td>${escapeHtml(timing.category)}</td>
      <td class="num">${formatUs(timing.selfTimeUs)}</td>
      <td class="num">${selfPct}</td>
      <td class="num">${formatUs(timing.totalTimeUs)}</td>
      <td class="num">${totalPct}</td>
      <td class="num">${timing.selfSamples}</td>
      <td class="loc"><code>${escapeHtml(location)}</code></td>
    </tr>`;
  }

  return `<table class="fn-table">
    <thead><tr>
      <th>Function</th>
      <th>Category</th>
      <th>Self Time</th>
      <th>Self %</th>
      <th>Total Time</th>
      <th>Total %</th>
      <th>Samples</th>
      <th>Location</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function generateSpanTable(spans: SpanSummary[]): string {
  if (spans.length === 0) {
    return '';
  }

  let rows = '';
  for (const span of spans) {
    rows += `<tr>
      <td><code>${escapeHtml(span.name)}</code></td>
      <td class="num">${formatMs(span.durationMs)}</td>
      <td class="num">${span.count}</td>
      <td class="num">${formatMs(span.durationMs / span.count)}</td>
    </tr>`;
  }

  return `<h3>Telemetry Spans (RuntimeTracer)</h3>
    <table>
      <thead><tr><th>Span</th><th>Total Duration</th><th>Count</th><th>Avg/Call</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// =============================================================================
// Overhead summary cards
// =============================================================================

function generateOverheadCards(analysis: ProfileAnalysis): string {
  const { categoryBreakdown, totalTimeUs, frameworkOverheadPct } = analysis;

  const kernelUs = categoryBreakdown.kernel + categoryBreakdown.wasm;
  const frameworkUs = categoryBreakdown.framework + categoryBreakdown.bundler;
  const gcUs = categoryBreakdown.gc;

  const kernelPct = formatPct(kernelUs, totalTimeUs);
  const frameworkPctString = formatPct(frameworkUs, totalTimeUs);
  const gcPct = formatPct(gcUs, totalTimeUs);

  return `<div class="overhead-grid">
    <div class="overhead-card">
      <div class="overhead-label">Kernel + WASM</div>
      <div class="overhead-value" style="color:#8B5CF6">${formatUs(kernelUs)}</div>
      <div class="overhead-sub">${kernelPct} of total</div>
    </div>
    <div class="overhead-card">
      <div class="overhead-label">Framework + Bundler</div>
      <div class="overhead-value" style="color:#3B82F6">${formatUs(frameworkUs)}</div>
      <div class="overhead-sub">${frameworkPctString} of total</div>
    </div>
    <div class="overhead-card">
      <div class="overhead-label">GC</div>
      <div class="overhead-value" style="color:#EF4444">${formatUs(gcUs)}</div>
      <div class="overhead-sub">${gcPct} of total</div>
    </div>
    <div class="overhead-card">
      <div class="overhead-label">Framework Overhead</div>
      <div class="overhead-value ${frameworkOverheadPct > 20 ? 'overhead-warn' : ''}">${frameworkOverheadPct.toFixed(1)}%</div>
      <div class="overhead-sub">of kernel + framework time</div>
    </div>
  </div>`;
}

// =============================================================================
// Per-case section
// =============================================================================

function generateCaseSection(caseName: string, analysis: ProfileAnalysis, profile?: CpuProfile): string {
  let downloadLink = '';
  if (profile) {
    const json = JSON.stringify(profile);
    const b64 = Buffer.from(json).toString('base64');
    downloadLink = `<a class="download-link" href="data:application/json;base64,${b64}" download="${escapeHtml(caseName)}.cpuprofile">Download .cpuprofile</a>`;
  }

  return `
    <div class="case-section">
      <h2>${escapeHtml(caseName)} ${downloadLink}</h2>
      <p class="meta">${analysis.totalSamples.toLocaleString()} samples &bull; ${formatUs(analysis.totalTimeUs)} profiled</p>

      ${generateOverheadCards(analysis)}

      <div class="chart-row">
        <div class="chart-cell">${generateDonutChart(analysis.categoryBreakdown, analysis.totalTimeUs)}</div>
        <div class="chart-cell">${generateLegend(analysis.categoryBreakdown, analysis.totalTimeUs)}</div>
      </div>

      <h3>Top Functions by Self Time</h3>
      ${generateFunctionTable(analysis.topFunctions, analysis.totalTimeUs)}

      ${generateSpanTable(analysis.spanSummaries)}
    </div>`;
}

// =============================================================================
// Full report
// =============================================================================

/** Data for a single profiled benchmark case. */
export type ProfiledCaseData = {
  name: string;
  analysis: ProfileAnalysis;
  profile?: CpuProfile;
};

/**
 * Generates a self-contained HTML CPU profile report for one or more benchmark cases.
 *
 * @param cases - Profiled benchmark case data
 * @param timestamp - ISO timestamp of the benchmark run
 * @returns Complete HTML document string
 */
export function generateProfileHtmlReport(cases: ProfiledCaseData[], timestamp: string): string {
  const caseSections = cases.map((c) => generateCaseSection(c.name, c.analysis, c.profile)).join('\n');

  const aggregateBreakdown: CategoryBreakdown = {
    kernel: 0,
    framework: 0,
    bundler: 0,
    wasm: 0,
    'runtime-node': 0,
    gc: 0,
    idle: 0,
    other: 0,
  };

  let aggregateTotalUs = 0;
  for (const c of cases) {
    for (const cat of allCategories) {
      aggregateBreakdown[cat] += c.analysis.categoryBreakdown[cat];
    }

    aggregateTotalUs += c.analysis.totalTimeUs;
  }

  const overheadUs = aggregateBreakdown.framework + aggregateBreakdown.bundler;
  const workUs = aggregateBreakdown.kernel + aggregateBreakdown.wasm;
  const attributableUs = overheadUs + workUs;
  const aggregateOverheadPct = attributableUs > 0 ? (overheadUs / attributableUs) * 100 : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CPU Profile Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1F2937; background: #F9FAFB; padding: 2rem; max-width: 1400px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 1rem; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem; }
  h3 { font-size: 1.05rem; margin: 1.5rem 0 0.75rem; color: #374151; }
  .meta { color: #6B7280; font-size: 0.875rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.8rem; }
  th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #E5E7EB; }
  th { background: #F3F4F6; font-weight: 600; color: #374151; position: sticky; top: 0; }
  tr:hover { background: #F9FAFB; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .loc { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  code { background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-size: 0.78rem; }
  .fn-table { font-size: 0.78rem; }
  .fn-table td, .fn-table th { padding: 0.3rem 0.5rem; }
  .cat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .chart-row { display: flex; gap: 2rem; align-items: center; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
  .chart-cell { flex-shrink: 0; }
  .legend { display: flex; flex-direction: column; gap: 0.35rem; }
  .legend-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.825rem; }
  .legend-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .legend-label { min-width: 90px; color: #374151; }
  .legend-value { color: #6B7280; font-variant-numeric: tabular-nums; }
  .overhead-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
  .overhead-card { background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.75rem 1rem; }
  .overhead-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; margin-bottom: 0.25rem; font-weight: 600; }
  .overhead-value { font-size: 1.25rem; font-weight: 700; color: #1F2937; }
  .overhead-sub { font-size: 0.7rem; color: #9CA3AF; margin-top: 0.15rem; }
  .overhead-warn { color: #EF4444; }
  .case-section { margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 2px solid #E5E7EB; }
  .case-section:last-child { border-bottom: none; }
  .download-link { font-size: 0.75rem; font-weight: 400; color: #3B82F6; text-decoration: none; margin-left: 0.75rem; }
  .download-link:hover { text-decoration: underline; }
  .aggregate-section { background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }
  .footer { margin-top: 3rem; color: #9CA3AF; font-size: 0.75rem; border-top: 1px solid #E5E7EB; padding-top: 1rem; }
</style>
</head>
<body>
  <h1>CPU Profile Report</h1>
  <p class="meta">Generated ${escapeHtml(timestamp)} &bull; ${cases.length} benchmark${cases.length === 1 ? '' : 's'} profiled</p>

  <div class="aggregate-section">
    <h3>Aggregate Time Breakdown</h3>
    <div class="chart-row">
      <div class="chart-cell">${generateDonutChart(aggregateBreakdown, aggregateTotalUs)}</div>
      <div class="chart-cell">${generateLegend(aggregateBreakdown, aggregateTotalUs)}</div>
    </div>
    <div class="overhead-grid">
      <div class="overhead-card">
        <div class="overhead-label">Total Profiled</div>
        <div class="overhead-value">${formatUs(aggregateTotalUs)}</div>
      </div>
      <div class="overhead-card">
        <div class="overhead-label">Aggregate Framework Overhead</div>
        <div class="overhead-value ${aggregateOverheadPct > 20 ? 'overhead-warn' : ''}">${aggregateOverheadPct.toFixed(1)}%</div>
        <div class="overhead-sub">of kernel + framework time</div>
      </div>
    </div>
  </div>

  ${caseSections}

  <div class="footer">
    Generated by Tau CPU Profile Analyzer &bull; ${cases.length} benchmark${cases.length === 1 ? '' : 's'} &bull; ${escapeHtml(timestamp)}
  </div>
</body>
</html>`;
}
