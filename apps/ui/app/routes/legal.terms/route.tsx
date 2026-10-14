import termsOfService from '#routes/legal.terms/terms-of-service.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Terms of Service · Tau' }];

export default function Terms(): React.JSX.Element {
  return <LegalDocument>{termsOfService}</LegalDocument>;
}
