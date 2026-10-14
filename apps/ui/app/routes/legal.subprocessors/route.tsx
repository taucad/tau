import subprocessors from '#routes/legal.subprocessors/subprocessors.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Sub-processors · Tau' }];

export default function Subprocessors(): React.JSX.Element {
  return <LegalDocument>{subprocessors}</LegalDocument>;
}
