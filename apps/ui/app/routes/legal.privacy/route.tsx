import privacyPolicy from '#routes/legal.privacy/privacy-policy.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Privacy Policy · Tau' }];

export default function Privacy(): React.JSX.Element {
  return <LegalDocument>{privacyPolicy}</LegalDocument>;
}
