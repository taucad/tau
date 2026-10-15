import acceptableUsePolicy from '#routes/legal.acceptable-use/acceptable-use-policy.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Acceptable Use Policy · Tau' }];

export default function AcceptableUse(): React.JSX.Element {
  return <LegalDocument>{acceptableUsePolicy}</LegalDocument>;
}
