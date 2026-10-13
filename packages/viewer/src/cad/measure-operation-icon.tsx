import type { MeasurementOperation } from '#constants/measurement.types.js';

/** The glyph of each measurement operation, drawn on a 24-unit grid with the current text colour. */
const operationGlyphs: Record<MeasurementOperation, React.ReactNode> = {
  angle: (
    <>
      <path d='M4 19V5m0 14h15M4 19 17 6M10 19a6 6 0 0 0-1.8-4.2' />
      <circle cx='4' cy='19' r='1' />
    </>
  ),
  'center-distance': (
    <>
      <circle cx='6' cy='12' r='4' />
      <circle cx='18' cy='12' r='4' />
      <path d='M8 12h8' />
      <circle cx='6' cy='12' r='.6' fill='currentColor' stroke='none' />
      <circle cx='18' cy='12' r='.6' fill='currentColor' stroke='none' />
    </>
  ),
  diameter: (
    <>
      <circle cx='12' cy='12' r='8' />
      <path d='M4 12h16m-13-2-3 2 3 2m10-4 3 2-3 2' />
    </>
  ),
  'edge-length': <path d='M4 18 19 6M4 14v7m-3-3h6m12-15v7m-3-4h6M7 15l9-7' />,
  'extent-x': <path d='M4 7v10m16-10v10M4 12h16m-13-3-3 3 3 3m10-6 3 3-3 3' />,
  'extent-y': <path d='M7 4h10M7 20h10M12 4v16m-3-13 3-3 3 3m-6 10 3 3 3-3' />,
  'extent-z': <path d='m2.5 15.5 6 6m7-19 6 6M5.5 18.5l13-13m-9.9 11.9-3.1 1.1 1.1-3.1m7.8-8.8 3.1-1.1-1.1 3.1' />,
  'minimum-distance': <path d='M4 4v5h5M20 20v-5h-5M9 9l6 6m-3-7v8m-2-6 2-2 2 2m-4 4 2 2 2-2' />,
  'plane-spacing': <path d='m3 6 9-3 9 3-9 3-9-3Zm0 12 9-3 9 3-9 3-9-3Zm9-8v4m-2-2 2-2 2 2m-4 0 2 2 2-2' />,
  'point-distance': (
    <>
      <circle cx='4.5' cy='12' r='1.5' />
      <circle cx='19.5' cy='12' r='1.5' />
      <path d='M7.5 12h9m-6-3-3 3 3 3m3-6 3 3-3 3' />
    </>
  ),
  radius: (
    <>
      <circle cx='12' cy='12' r='8' />
      <path d='M12 12h8m-3-2 3 2-3 2' />
      <circle cx='12' cy='12' r='.7' fill='currentColor' stroke='none' />
    </>
  ),
};

/** The icon of one measurement operation; decorative, so the row's label names the operation. */
export function MeasureOperationIcon({
  operation,
  ...properties
}: Readonly<{ operation: MeasurementOperation }> & React.ComponentProps<'svg'>): React.JSX.Element {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      {...properties}
    >
      {operationGlyphs[operation]}
    </svg>
  );
}
