import { Link } from 'react-router';
import type { PublishedArticle } from '#www/editorial.js';
import { Button } from '@taucad/ui/components/button';
import { SiteLink } from '#www/site-link.js';
import { Badge } from '@taucad/ui/components/badge';
import type { ReactNode } from 'react';
import { appOrigin, docsOrigin } from '#www/environment.js';
import { ecosystem, exampleUrl, plans, principles, sourceUrl, storyChapters, useCases } from '#www/content.js';
import { heroDrafting } from '#www/hero-view.js';
import { diagrams } from '#www/principle-diagrams.js';
import { geospecRun as evidence } from '@taucad/planetary-gearbox';
export const out = (
  <span className='out' aria-hidden='true'>
    ↗
  </span>
);
export const down = <span aria-hidden='true'>↓</span>;
export const cta: (label?: string, path?: string, placement?: string) => ReactNode = (
  label = 'Download Tau',
  path = '/download/',
  placement = 'primary',
) => (
  <SiteLink
    className='button primary'
    href={path === '/download/' ? path : `${appOrigin}${path}`}
    data-event='cta'
    data-placement={placement}
    data-host-download={path === '/download/' ? 'page' : undefined}
  >
    {label} {out}
  </SiteLink>
);
export const kicker: (text: string) => ReactNode = (text) => <p className='kicker'>{text}</p>;
export const intro: (options: { eyebrow: string; title: ReactNode; body: string; aside?: ReactNode }) => ReactNode = ({
  eyebrow,
  title,
  body,
  aside = '',
}) => (
  <header className='cell page-intro'>
    <div>
      {kicker(eyebrow)}
      <h1>{title}</h1>
      <p className='lead'>{body}</p>
    </div>
    {aside}
  </header>
);
const verifiedDate = new Date(evidence.startedAt).toLocaleDateString('en-NZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const drafting = () => {
  const { axes, ring, ticks, longTicks, extensions, dimension, zero, line } = heroDrafting();
  const at = (value: number) => `${(value / 10).toFixed(2)}%`;
  return (
    <svg className='drafting' aria-hidden='true'>
      <svg viewBox='0 0 1000 1000' overflow='visible'>
        <path className='d-axes' d={axes} pathLength='1' />
        <path className='d-ring' d={ring} pathLength='1' />
        <g className='d-ticks'>
          <path d={ticks} />
          <path className='long' d={longTicks} />
        </g>
        <path className='d-input' d='' data-dial-input />
        <g className='d-dim'>
          <path d={extensions} pathLength='1' />
          <path d={dimension} pathLength='1' />
        </g>
      </svg>
      <text className='d-label' x={at(zero[0])} y={at(zero[1])} textAnchor='middle'>
        0°
      </text>
      <text className='d-label d-size' x='50%' y={at(line)} dy='1.6em' textAnchor='middle'>
        Ø 174 mm rim
      </text>
    </svg>
  );
};
export const heroStage = (): React.JSX.Element => (
  <figure className='hero-stage' data-hero-stage>
    <div className='stage-labels top'>
      <span>Object 001 — Planetary gearbox</span>
      <span>34 parts · Replicad</span>
    </div>
    <div className='hero-model'>
      {drafting()}
      <picture>
        <source
          type='image/avif'
          srcSet='/_www/assets/hero-gearbox-480.avif 480w, /_www/assets/hero-gearbox-720.avif 720w, /_www/assets/hero-gearbox-1200.avif 1200w'
          sizes='(max-width: 760px) 84vw, 42vw'
        />
        <img
          className='poster'
          src='/_www/assets/hero-gearbox.webp'
          srcSet='/_www/assets/hero-gearbox-720.webp 720w, /_www/assets/hero-gearbox.webp 1200w'
          sizes='(max-width: 760px) 92vw, 46vw'
          width='1200'
          height='1200'
          fetchPriority='high'
          alt='A planetary gearbox rendered from Tau’s authored CAD example: a fixed ring gear, three planet gears around a sun gear, and a blue output carrier held by three socket screws'
        />
      </picture>
      <div className='sweep' aria-hidden='true' />
      <div className='stage-canvas' data-canvas-host />
    </div>
    <figcaption className='stage-labels bottom'>
      <span className='readout' data-readout aria-live='off'>
        Input <b data-in>0°</b> → Output <b data-out>0.0°</b> · 4:1
      </span>
      <span className='stage-control' data-turn hidden>
        <label htmlFor='turn-input'>Turn the input</label>
        <input
          id='turn-input'
          type='range'
          min='0'
          max='1440'
          step='5'
          defaultValue='0'
          aria-valuetext='Input 0 degrees, output 0 degrees'
        />
      </span>
      <Button variant='outline' size='sm' data-activate-hero hidden>
        Explore in 3D
      </Button>
      <span className='stage-note' data-note>
        Rendered from the authored CAD source
      </span>
    </figcaption>
  </figure>
);
const storyOverlays = () => {
  const passed = evidence.tests.filter((test) => test.status === 'passed');
  return (
    <>
      <div className='overlay o-idea' data-for='0' aria-hidden='true'>
        <svg viewBox='0 0 400 400'>
          <circle className='rim' cx='200' cy='200' r='174' pathLength='1' />
          <circle cx='200' cy='200' r='144' pathLength='1' />
          <circle cx='200' cy='200' r='48' pathLength='1' />
          <circle cx='200' cy='104' r='48' pathLength='1' />
          <circle cx='283.1' cy='248' r='48' pathLength='1' />
          <circle cx='116.9' cy='248' r='48' pathLength='1' />
          <circle className='rim' cx='200' cy='200' r='96' pathLength='1' />
          <path d='M26 392 H374 M26 386 V398 M374 386 V398' pathLength='1' />
        </svg>
        <span className='tag t1'>Ring · 72 teeth · fixed</span>
        <span className='tag t2'>Sun · 24 · input</span>
        <span className='tag t3'>3 planets · 24 teeth</span>
        <span className='tag t4'>Ø 174 mm rim</span>
      </div>
      <div className='overlay o-prompt' data-for='1' aria-hidden='true'>
        <div className='composer'>
          <span className='kicker'>New project</span>
          <p>Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.</p>
          <span className='send'>Send</span>
        </div>
      </div>
      <div className='overlay o-agents' data-for='2 3' aria-hidden='true'>
        <span className='lane l1'>
          <b>Ring</b>Internal ring gear · 72 teeth
        </span>
        <span className='lane l2'>
          <b>Gear train</b>Sun · 3 planets · bushings
        </span>
        <span className='lane l3'>
          <b>Carrier & hardware</b>2 carriers · pins · spacers · screws
        </span>
      </div>
      <div className='overlay o-turn' data-for='4' aria-hidden='true'>
        <span className='tag'>Sun 360° → Carrier 90°</span>
      </div>
      <div className='overlay o-param' data-for='5' aria-hidden='true'>
        <pre>
          <code>
            <span className='c'>main.ts parameters</span>
            module: 2,
            <del>faceWidth: 14,</del>
            <ins>faceWidth: 18,</ins>
            <del>inputAngle: 0,</del>
            <ins>inputAngle: 30,</ins>
          </code>
        </pre>
        <span className='tag'>Axial envelope 68 → 72 mm</span>
      </div>
      <div className='overlay o-evidence' data-for='6' aria-hidden='true'>
        <div className='evidence-card'>
          <span className='kicker'>GeoSpec · recorded run</span>
          <p className='tally'>
            <b>{evidence.summary.passed}</b> passed <b>{evidence.summary.failed}</b> failed{' '}
            <b>{evidence.summary.inconclusive}</b> inconclusive
          </p>
          <ul>
            {passed.map((test) => (
              <li key={test.name}>
                <span className='mark ok'>✓</span>
                {test.name}
              </li>
            ))}
            <li>
              <span className='mark unknown'>?</span>
              {evidence.summary.inconclusive} need evidence GeoSpec cannot measure yet
            </li>
          </ul>
        </div>
      </div>
      <div className='overlay o-print' data-for='7' aria-hidden='true'>
        <span className='tag'>Build volume 256 × 256 × 256 mm</span>
        <span className='tag subtle'>Illustration · not slicer output</span>
      </div>
      <div className='overlay o-devices' data-for='8' aria-hidden='true'>
        <svg viewBox='0 0 400 300'>
          <rect x='80' y='62' width='240' height='160' rx='8' pathLength='1' />
          <path d='M58 234 H342 L330 246 H70 Z' pathLength='1' />
        </svg>
        <div className='phone'>
          <img src='/_www/assets/hero-thumbnail.webp' width='720' height='720' alt='' loading='lazy' decoding='async' />
        </div>
        <span className='tag'>Same project · synced through Tau Cloud</span>
      </div>
    </>
  );
};
const evidenceList = () => (
  <>
    <ul className='evidence-list'>
      {evidence.tests.map((test) => (
        <li key={test.name} data-status={test.status}>
          <span
            className={`mark ${test.status === 'passed' ? 'ok' : test.status === 'failed' ? 'bad' : 'unknown'}`}
            aria-hidden='true'
          >
            {test.status === 'passed' ? '✓' : test.status === 'failed' ? '✕' : '?'}
          </span>
          <span>{test.name}</span>
          <span className='status'>
            {test.status === 'passed' ? 'Passed' : test.status === 'failed' ? 'Failed' : 'Inconclusive'}
          </span>
        </li>
      ))}
    </ul>
    <p className='fine'>
      Recorded {verifiedDate} with the GeoSpec engine CLI on the authored example (model SHA-256 464caa7c…),{' '}
      {Math.round(evidence.durationMs / 100) / 10} s. Inconclusive means the check needs evidence GeoSpec does not
      measure yet; it is not a pass. Geometric checks do not certify strength or manufacturing readiness.
    </p>
  </>
);
export const storyMarkup = (): React.JSX.Element => (
  <section className='band story' id='story' aria-labelledby='story-title'>
    <header className='cell section-head'>
      {kicker('One idea, start to finish')}
      <h2 id='story-title'>
        Watch a gearbox
        <br />
        come together.
      </h2>
      <p>
        A 4:1 planetary gearbox from Tau’s authored example: 34 named parts, three planets, one sun and socket screws on
        top. Follow the design through assembly, geometric checks and one way to make it.
      </p>
    </header>
    <div className='story-layout'>
      <div className='story-visual'>
        <figure className='story-stage' data-story-stage data-chapter='0'>
          <div className='stage-labels top'>
            <span data-story-count>01 / 09 · Idea</span>
            <span>Planetary gearbox · 4:1</span>
          </div>
          <div className='story-canvas'>
            <img
              className='poster'
              data-story-poster
              src='/_www/assets/story-4.webp'
              width='1000'
              height='1000'
              loading='lazy'
              decoding='async'
              alt='The assembled planetary gearbox from Tau’s authored example'
            />
            <div className='stage-canvas' data-canvas-host />
            {storyOverlays()}
          </div>
          <figcaption className='stage-labels bottom'>
            <span data-story-caption>Authored Tau example · rendered from source</span>
            <button className='stage-button' type='button' data-story-toggle hidden aria-pressed='false'>
              Show still frames
            </button>
          </figcaption>
        </figure>
      </div>
      <ol className='story-chapters'>
        {storyChapters.map((chapter, index) => (
          <li key={chapter.id} className='story-chapter' id={`story-${chapter.id}`} data-story-chapter={index}>
            <p className='kicker'>
              <span className='step'>{String(index + 1).padStart(2, '0')}</span> {chapter.label}
            </p>
            <h3>{chapter.title}</h3>
            <p>{chapter.body}</p>
            {chapter.id === 'verification' ? evidenceList() : ''}
            <p className='detail'>{chapter.detail}</p>
            {chapter.note ? <p className='fine'>{chapter.note}</p> : ''}
          </li>
        ))}
      </ol>
    </div>
    <p className='cell story-foot'>
      Kinematics follow the source: fixed ring, sun input, carrier output at one quarter of the sun’s rotation. Motion
      is prescribed, not a physical simulation. <SiteLink href={exampleUrl}>Open the model source {out}</SiteLink>
    </p>
  </section>
);
export const principleStrip = (): React.JSX.Element => (
  <section className='band principles' aria-label='Design, verify, make'>
    {principles.map((item, index) => (
      <article key={item.id} className='cell principle'>
        <p className='kicker'>
          <span className='step'>0{index + 1}</span> {item.id}
        </p>
        <span
          className='principle-illustration'
          // oxlint-disable-next-line react/no-danger -- Only the locally generated, fixed SVG diagram markup enters this element.
          dangerouslySetInnerHTML={{ __html: diagrams[item.id] }}
        />
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        <p className='detail'>{item.detail}</p>
      </article>
    ))}
  </section>
);
export const workspaceFigure = (loading: 'lazy' | 'eager' = 'lazy'): React.JSX.Element => (
  <figure className='workspace'>
    <picture>
      <source
        media='(prefers-color-scheme: dark)'
        srcSet='/_www/assets/workspace-dark-640.webp 640w, /_www/assets/workspace-dark-1280.webp 1280w, /_www/assets/workspace-dark-1920.webp 1920w, /_www/assets/workspace-dark-2560.webp 2560w'
        sizes='(max-width: 760px) calc((100vw - 48px) * 1.065), calc(min(1180px, 90vw) * 1.065)'
      />
      <img
        src='/_www/assets/workspace-1280.webp'
        srcSet='/_www/assets/workspace-640.webp 640w, /_www/assets/workspace-1280.webp 1280w, /_www/assets/workspace-1920.webp 1920w, /_www/assets/workspace-2560.webp 2560w'
        sizes='(max-width: 760px) calc((100vw - 48px) * 1.065), calc(min(1180px, 90vw) * 1.065)'
        width='3680'
        height='2384'
        loading={loading}
        alt='The Tau workspace: an AI conversation, editable design files, the planetary gearbox in the viewport and its parameters'
      />
    </picture>
    <figcaption>
      <span>Actual Tau workspace</span>
      <span>Design it → check it → make it</span>
    </figcaption>
  </figure>
);
export const ecosystemGrid = (): React.JSX.Element => (
  <section className='band ecosystem' aria-labelledby='ecosystem-title'>
    <header className='cell section-head'>
      {kicker('Open by design')}
      <h2 id='ecosystem-title'>
        Your tools,
        <br />
        working together.
      </h2>
      <p>
        Choose the engine that suits the part and the model that suits the job. Apache-2.0 source you can read, run and
        build on.
      </p>
    </header>
    {ecosystem.map((group) => (
      <div key={group.title} className='eco-row'>
        <div className='cell eco-label'>
          <h3>{group.title}</h3>
          <p>{group.body}</p>
        </div>
        <ul className='eco-items'>
          {group.items.map(([name, where]) => (
            <li key={name}>
              <span>{name}</span>
              <span className='where'>{where}</span>
            </li>
          ))}
        </ul>
      </div>
    ))}
    <div className='cell eco-foot'>
      <p>Open source. Apache-2.0. Yours to build on.</p>
      <SiteLink className='text-link' href={sourceUrl}>
        Explore the source {out}
      </SiteLink>
    </div>
  </section>
);
export const caseCards = (): React.JSX.Element => (
  <div className='case-grid'>
    {useCases.map((item) => (
      <SiteLink key={item.slug} className='case' href={`/use-cases/${item.slug}/`}>
        <div className='case-image'>
          <img
            src={`/_www/assets/${item.image.replace('.webp', '-768.webp')}`}
            srcSet={`/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w`}
            sizes='(max-width: 760px) calc(100vw - 48px), 400px'
            alt={item.alt}
            loading='lazy'
            width='1536'
            height='1152'
          />
        </div>
        <div className='case-text'>
          {kicker(item.audience)}
          <h3>
            {item.title} <span aria-hidden='true'>→</span>
          </h3>
        </div>
      </SiteLink>
    ))}
  </div>
);
export const planCards = (compact = false): React.JSX.Element => (
  <div className='plans'>
    {plans.map((plan) => (
      <article key={plan.id} className={`cell plan${plan.id === 'pro' ? ' featured' : ''}`}>
        <div className='plan-head'>
          <h3>{plan.name}</h3>
          {plan.id === 'pro' ? <Badge variant='secondary'>Most popular</Badge> : ''}
        </div>
        <p>{plan.tagline}</p>
        <p className='price'>
          {plan.price}
          <span>{plan.billingPeriod}</span>
        </p>
        {compact ? (
          ''
        ) : (
          <ul>
            {plan.features.map(([label, flag]) => (
              <li key={label} className={flag ? 'soon' : ''}>
                <span className='mark' aria-hidden='true'>
                  {flag ? '○' : '✓'}
                </span>
                <span>
                  {label}
                  {flag ? (
                    <>
                      {' '}
                      <span className='soon-label'>· Coming soon</span>
                    </>
                  ) : (
                    ''
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {plan.cta[1].startsWith('mailto:') ? (
          <SiteLink className='button' href={plan.cta[1]}>
            {plan.cta[0]} {out}
          </SiteLink>
        ) : (
          <SiteLink
            className={`button${plan.id === 'pro' ? ' primary' : ''}`}
            href={`${appOrigin}${plan.cta[1]}`}
            data-event='cta'
            data-placement={`pricing-${plan.id}`}
          >
            {plan.cta[0]} {out}
          </SiteLink>
        )}
      </article>
    ))}
  </div>
);
export const closing = (
  title = (
    <>
      What will you
      <br />
      make real?
    </>
  ),
): React.JSX.Element => (
  <section className='band closing' aria-labelledby='closing-title'>
    <div className='cell closing-copy'>
      {kicker('Design. Verify. Make.')}
      <h2 id='closing-title'>{title}</h2>
      <div className='actions'>
        {cta('Download Tau', '/download/', 'closing')}
        <SiteLink className='text-link' href={`${docsOrigin}/`}>
          Read the docs {out}
        </SiteLink>
      </div>
    </div>
    <div className='closing-art' aria-hidden='true'>
      <img
        src='/_www/assets/metal-hero-640.webp'
        srcSet='/_www/assets/metal-hero-640.webp 640w, /_www/assets/metal-hero.webp 1100w'
        sizes='(max-width: 760px) 70vw, 36vw'
        width='1100'
        height='1100'
        loading='lazy'
        alt=''
      />
    </div>
  </section>
);
export function PublishedArticleContent({ article }: { article: PublishedArticle }): React.JSX.Element {
  return (
    <article className='wrap cell prose'>
      <header className='page-intro'>
        <p className='kicker'>The Tau blog</p>
        <h1>{article.title}</h1>
        <p>
          By {article.author} · <time dateTime={article.date}>{article.date}</time>
        </p>
      </header>
      {article.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <Link to='/blog/'>← All posts</Link>
    </article>
  );
}

export function UseCase({ item }: { item: (typeof useCases)[number] }): React.JSX.Element {
  return (
    <>
      <section className='band use-case'>
        {intro({
          eyebrow: item.audience,
          title: item.title,
          body: item.description,
          aside: (
            <img
              className='case-detail-image'
              src={`/_www/assets/${item.image.replace('.webp', '-768.webp')}`}
              srcSet={`/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w`}
              sizes='(max-width: 760px) calc(100vw - 48px), 420px'
              width='1536'
              height='1152'
              alt={item.alt}
            />
          ),
        })}
        <ol className='steps'>
          {item.steps.map(([title, body], index) => (
            <li key={title} className='cell'>
              <p className='kicker'>
                <span className='step'>0{index + 1}</span>
              </p>
              <h2>{title}</h2>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        <p className='cell fine'>
          Images show authored Tau examples, not customer case studies.{' '}
          <SiteLink href='/use-cases/'>All use cases →</SiteLink>
        </p>
      </section>
      {closing()}
    </>
  );
}
