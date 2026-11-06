import gearboxUrl from '#components/auth/assets/hero-gearbox.webp?url';
import gearbox720Url from '#components/auth/assets/hero-gearbox-720.webp?url';

/**
 * The auth pages' side panel: the homepage's planetary gearbox render and what it is.
 *
 * A static image with no renderer, script or motion, so the sign-in form is the
 * only thing the page has to load.
 *
 * @returns The illustration panel.
 */
export function AuthShowcase(): React.JSX.Element {
  return (
    <figure className='flex size-full flex-col items-center justify-center gap-2 bg-muted/40 p-10'>
      <img
        src={gearboxUrl}
        srcSet={`${gearbox720Url} 720w, ${gearboxUrl} 1200w`}
        sizes='(min-width: 1024px) 40vw, 0px'
        width={1200}
        height={1200}
        decoding='async'
        alt='A planetary gearbox modeled in Tau: a fixed ring gear, three planet gears around a sun gear, and a blue output carrier held by three socket screws'
        className='aspect-square w-full max-w-xl object-contain'
      />
      <figcaption className='max-w-sm space-y-1 text-center'>
        <p className='text-sm font-medium'>Planetary gearbox</p>
        <p className='text-sm text-muted-foreground'>
          4:1 reduction, 174 mm rim, 34 parts. Rendered from its parametric CAD source in Tau.
        </p>
      </figcaption>
    </figure>
  );
}
