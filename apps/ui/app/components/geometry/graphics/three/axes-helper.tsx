import type { JSX } from 'react';

export function AxesHelper(): JSX.Element {
  // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
  return <axesHelper args={[5000]} userData={{ isPreviewOnly: true }} />;
}
