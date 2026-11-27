import { ExternalLink } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { SettingsRow } from '#components/settings/settings-item.js';
import type { SettingId } from '#components/settings/settings-catalogue.js';

export type WebHandOffRowProps = {
  /** The catalogue id the row answers for search, when it stands in for that setting. */
  readonly settingId?: SettingId;
  readonly title: string;
  readonly description?: string;
  /** The page on Tau's website that holds this setting. */
  readonly href: string;
};

/**
 * A setting Tau Desktop leaves to the website (desktop sign-in ruling D1=A): its title and a button that opens the
 * page in the browser. The desktop's sign-in cannot change it, so the row fetches nothing and starts nothing until
 * pressed. In the desktop window a new-window link opens in the system browser.
 *
 * @param props - The setting's copy and its page on the website.
 * @returns The row.
 */
export function WebHandOffRow({
  settingId,
  title,
  description,
  href,
}: WebHandOffRowProps): React.JSX.Element | undefined {
  return (
    <SettingsRow
      settingId={settingId}
      title={title}
      description={description ?? 'Change this on Tau’s website.'}
      control={
        <Button asChild variant='outline' size='sm'>
          <a href={href} target='_blank' rel='noreferrer'>
            Open on the web
            <ExternalLink aria-hidden='true' className='size-3' />
          </a>
        </Button>
      }
    />
  );
}
