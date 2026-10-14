import openSourceNotices from '#routes/legal.open-source/open-source-notices.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Open-Source Notices · Tau' }];

export default function OpenSourceNotices(): React.JSX.Element {
  return <LegalDocument>{openSourceNotices}</LegalDocument>;
}
