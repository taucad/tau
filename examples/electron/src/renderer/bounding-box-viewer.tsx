import type { GltfInspection } from './gltf-inspector.js';

export type BoundingBoxViewerProperties = {
  readonly inspection: GltfInspection;
};

const fmt = (n: number): string => (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3));
const vec = (v: readonly [number, number, number]): string => `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;

export function BoundingBoxViewer({ inspection }: BoundingBoxViewerProperties): React.ReactElement {
  const { asset, counts, bbox } = inspection;
  return (
    <div data-testid='bbox-viewer' style={containerStyles}>
      <h3 style={sectionTitleStyles}>Bounding box</h3>
      <dl style={descriptionListStyles}>
        <dt>min</dt>
        <dd data-testid='bbox-min'>{vec(bbox.min)}</dd>
        <dt>max</dt>
        <dd data-testid='bbox-max'>{vec(bbox.max)}</dd>
        <dt>size</dt>
        <dd data-testid='bbox-size'>{vec(bbox.size)}</dd>
        <dt>center</dt>
        <dd data-testid='bbox-center'>{vec(bbox.center)}</dd>
      </dl>
      <h3 style={sectionTitleStyles}>Counts</h3>
      <dl style={descriptionListStyles}>
        <dt>meshes</dt>
        <dd data-testid='count-meshes'>{counts.meshes}</dd>
        <dt>primitives</dt>
        <dd data-testid='count-primitives'>{counts.primitives}</dd>
        <dt>vertices</dt>
        <dd data-testid='count-vertices'>{counts.vertices}</dd>
        <dt>triangles</dt>
        <dd data-testid='count-triangles'>{counts.triangles}</dd>
      </dl>
      <h3 style={sectionTitleStyles}>Asset</h3>
      <dl style={descriptionListStyles}>
        <dt>version</dt>
        <dd data-testid='asset-version'>{asset.version}</dd>
        <dt>generator</dt>
        <dd data-testid='asset-generator'>{asset.generator ?? '\u2014'}</dd>
      </dl>
    </div>
  );
}

const containerStyles: React.CSSProperties = {
  fontSize: '0.85rem',
  overflow: 'auto',
  padding: '0.85rem',
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 750,
  margin: '0.75rem 0 0.45rem',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  color: '#d9e2ee',
};

const descriptionListStyles: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '8ch 1fr',
  gap: '0.25rem 0.65rem',
  margin: 0,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  color: '#aab6c5',
  fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
};
