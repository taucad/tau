import { SiteLink } from '#www/site-link.js';
import { appOrigin } from '#www/environment.js';
import { desktopDownloads, desktopDownloadHref, desktopDownloadLabel } from '#www/downloads.js';
import { sourceUrl } from '#www/content.js';
import { out, down, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

function DownloadLabel({ platform }: { platform: keyof typeof desktopDownloads }): React.JSX.Element {
  return (
    <span
      className='inline-flex items-center gap-2'
      // oxlint-disable-next-line react/no-danger -- Only checked-in brand SVGs and product constants form this markup.
      dangerouslySetInnerHTML={{ __html: desktopDownloadLabel(platform) }}
    />
  );
}

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Tau Desktop',
      title: (
        <>
          Your workshop.
          <br />
          On your computer.
        </>
      ),
      body: 'Design with local files, native CAD kernels and your own coding agents. Choose Tau for Mac, Windows or Linux.',
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
            <p className='fine' data-download-detail>
              Mac · Windows · Linux
            </p>
          </div>
          <div data-mac-intel hidden>
            <SiteLink
              className='button'
              href={desktopDownloadHref('macIntel')}
              data-event='download'
              data-placement='download'
              aria-label='Download for Intel Mac'
            >
              <DownloadLabel platform='macIntel' />
            </SiteLink>
            <p className='fine'>Intel Mac · ZIP download</p>
          </div>
        </div>
      ),
    })}
    <div className='download-grid'>
      <article className='cell' data-platform-card='desktop'>
        <p className='kicker'>Get started</p>
        <h2>Make room for your next idea.</h2>
        <p data-install-instructions>
          Choose the build for your computer below, extract the archive, then launch Tau and sign in.
        </p>
        <p data-platform-note>Mac builds update automatically. Windows and Linux builds are updated manually.</p>
        <SiteLink className='text-link' href={`${sourceUrl}/releases`}>
          Release notes {out}
        </SiteLink>
      </article>
      <article className='cell' id='downloads'>
        <p className='kicker'>All desktop downloads</p>
        <h2>Pick your workspace.</h2>
        <div className='download-options'>
          <p className='fine'>
            On a Mac, choose Apple silicon or Intel. Find your chip in Apple menu → About This Mac.
          </p>
          <div className='actions'>
            {(['mac', 'macIntel', 'windows', 'linux'] as const).map((platform) => (
              <div key={platform}>
                <SiteLink
                  className='text-link'
                  href={desktopDownloadHref(platform)}
                  data-event='download'
                  data-placement='download'
                >
                  <DownloadLabel platform={platform} />
                </SiteLink>
                <p className='fine'>{desktopDownloads[platform].detail}</p>
              </div>
            ))}
          </div>
        </div>
        <SiteLink className='text-link' href={`${appOrigin}/projects`} data-event='cta' data-placement='download-web'>
          Open in browser {out}
        </SiteLink>
      </article>
    </div>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
