/**
 * Summarize `agent-edit.mts` reports: per model and arm, median and p90 wall, the paired difference against the
 * editor, the verdict against the target (agent and watch at or below the editor's median plus 100 ms), and phase
 * medians for attributing a gap.
 *
 * Usage: node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/agent-edit-summarize.mts <report.json>...
 */
import { readFileSync } from 'node:fs';

const targetMs = 100;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
};
const median = (values: number[]) => quantile(values, 0.5);
const fmt = (value: number) => (Number.isNaN(value) ? '—' : Math.round(value).toString());

const rows: string[] = [];
const phaseRows: string[] = [];
for (const file of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const byArm = (arm: string) => report.steps.filter((step: any) => step.arm === arm);
  const editor = byArm('editor');
  const editorMedian = median(editor.map((step: any) => step.wallMs));
  const loads = report.steps.map((step: any) => step.load);
  for (const arm of report.arms as string[]) {
    const steps = byArm(arm);
    const walls = steps.map((step: any) => step.wallMs);
    const deltas = steps
      .map((step: any) => {
        const partner = editor.find((other: any) => other.pair === step.pair);
        return partner ? step.wallMs - partner.wallMs : Number.NaN;
      })
      .filter((delta: number) => !Number.isNaN(delta));
    const verdict =
      arm === 'editor'
        ? ''
        : median(walls) <= editorMedian + targetMs
          ? 'pass'
          : `miss by ${fmt(median(walls) - editorMedian - targetMs)}`;
    rows.push(
      `| ${report.model} | ${arm} | ${steps.length} | ${fmt(median(walls))} | ${fmt(quantile(walls, 0.9))} | ${arm === 'editor' ? '' : `${fmt(median(walls) - editorMedian)} (paired ${fmt(median(deltas))})`} | ${verdict} | ${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)} |`,
    );
    const phase = (name: string) => fmt(median(steps.map((step: any) => step.phases?.[name] ?? Number.NaN)));
    const mark = (name: string) => fmt(median(steps.map((step: any) => step[name] ?? Number.NaN)));
    const runs = [
      ...new Set(
        steps.map((step: any) => `${step.phases.modelRuns}/${step.phases.tessellations}/${step.phases.sceneHits}`),
      ),
    ].join(',');
    phaseRows.push(
      `| ${report.model} | ${arm} | ${mark(arm === 'editor' ? 'writeMs' : 'editFileMs')} | ${arm === 'watch' ? mark('notifyMs') : '—'} | ${phase('bundle')} | ${phase('build')} | ${phase('evaluate')} | ${phase('tessellate')} | ${phase('pack')} | ${phase('render')} | ${arm === 'agent' ? mark('renderedToReturnMs') : '—'} | ${runs} | ${new Set(steps.map((s: any) => s.glbBytes)).size === 1 ? steps[0].glbBytes : 'varies'} |`,
    );
  }
}
console.log(
  '| Model | Arm | n | Median ms | p90 ms | vs editor median (paired median Δ) | Target ≤ editor + 100 ms | Load (1 min) |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(rows.join('\n'));
console.log();
console.log(
  '| Model | Arm | Write | Notify | Bundle | Build (run-main) | Evaluate | Tessellate | GLB pack | Render | Tool tail | runs/tess/hits | GLB bytes |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(phaseRows.join('\n'));
