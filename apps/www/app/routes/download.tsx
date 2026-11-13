import { SiteLink } from '#www/site-link.js';
import { appHref } from '#www/environment.js';
import { archiveDownloads, desktopDownloadHref, desktopDownloadLabel, desktopFileLabel } from '#www/downloads.js';
import { sourceUrl } from '#www/content.js';
import { out, down, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

/**
 * The icon and label are the link's own children, as the client relabels them, so a button's icon padding applies.
 * @param platform - A platform published as a channel archive.
 * @returns Inner HTML from checked-in brand SVGs and product constants only.
 */
const downloadLabel = (platform: keyof typeof archiveDownloads): { __html: string } => ({
  __html: desktopFileLabel(platform),
});

/**
 * A Mac entry renders hidden with its platform label and no file URL; only the installer catalog reveals it, with the
 * qualified DMG's link and label.
 * @param platform - A Mac architecture.
 * @returns Inner HTML from checked-in brand SVGs and product constants only.
 */
const macPlaceholderLabel = (platform: 'mac' | 'macIntel'): { __html: string } => ({
  __html: desktopDownloadLabel(platform),
});

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Tau Desktop',
      title: 'Download Tau',
      body: 'Tau Desktop is available for macOS, Windows and Linux. Work with local files, native CAD kernels and your own coding agents.',
      aside: (
        <div className='actions download-actions'>
          <div>
            <SiteLink
              className='button primary'
              href='#downloads'
              data-host-download='direct'
              data-event='download'
              data-placement='download'
            >
              Choose your download {down}
            </SiteLink>
            <p className='fine' data-download-detail='host'>
              macOS · Windows · Linux
            </p>
          </div>
          <div data-mac-route='macIntel' data-mac-hero hidden>
            <SiteLink
              className='button'
              href='#downloads'
              data-event='download'
              data-placement='download'
              data-download-platform='macIntel'
              // oxlint-disable-next-line react/no-danger -- Only checked-in brand SVGs and product constants form this markup.
              dangerouslySetInnerHTML={macPlaceholderLabel('macIntel')}
            />
            <p className='fine' data-download-detail='macIntel' />
          </div>
        </div>
      ),
    })}
    <div className='download-grid'>
      <article className='cell' data-platform-card='desktop'>
        <p className='kicker'>Installation</p>
        <h2>Install Tau</h2>
        <p data-install-instructions>Download the build for your computer, then open Tau and sign in.</p>
        <p data-platform-note>
          Mac builds update automatically. On Windows and Linux, download new versions from this page.
        </p>
        <SiteLink className='text-link' href={`${sourceUrl}/releases`}>
          Release notes {out}
        </SiteLink>
      </article>
      <article className='cell' id='downloads'>
        <p className='kicker'>All downloads</p>
        <h2>Choose your platform</h2>
        <div className='download-options'>
          <p className='fine'>
            Not sure which Mac you have? Open Apple menu → About This Mac and check the Chip or Processor line.
          </p>
          <div className='actions'>
            {(['mac', 'macIntel'] as const).map((platform) => (
              // Mac entries are unlisted until a qualified catalog publishes that architecture's DMG.
              <div key={platform} data-mac-route={platform} hidden>
                <SiteLink
                  className='text-link'
                  href='#downloads'
                  data-download-platform={platform}
                  data-event='download'
                  data-placement='download'
                  // oxlint-disable-next-line react/no-danger -- Only checked-in brand SVGs and product constants form this markup.
                  dangerouslySetInnerHTML={macPlaceholderLabel(platform)}
                />
                <p className='fine' data-download-detail={platform} />
              </div>
            ))}
            {(['windows', 'linux'] as const).map((platform) => (
              <div key={platform}>
                <SiteLink
                  className='text-link'
                  href={desktopDownloadHref(platform)}
                  data-download-platform={platform}
                  data-event='download'
                  data-placement='download'
                  // oxlint-disable-next-line react/no-danger -- Only checked-in brand SVGs and product constants form this markup.
                  dangerouslySetInnerHTML={downloadLabel(platform)}
                />
                <p className='fine' data-download-detail={platform}>
                  {archiveDownloads[platform].detail}
                </p>
              </div>
            ))}
          </div>
        </div>
        <SiteLink
          className='text-link'
          href={appHref('/projects')}
          isAppLink
          data-event='cta'
          data-placement='download-web'
        >
          Use Tau in your browser instead {out}
        </SiteLink>
      </article>
    </div>
    <div className='cell installer-guide' data-qualified-downloads hidden />
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
