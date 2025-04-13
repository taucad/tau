import type { ThreeElements } from '@react-three/fiber';

declare global {
  namespace React {
    namespace JSX {
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions -- This is a valid implementation for Three.js
      interface IntrinsicElements extends ThreeElements {}
    }

    // Add support for CSS variables in CSSProperties.
    // Currently any CSS variables are supported.
    // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style, @typescript-eslint/consistent-type-definitions, @typescript-eslint/naming-convention -- This is easier to read than a Record.
    interface CSSProperties extends CSS.Properties<string | number> {
      [key: `--${string}`]: string | number;
    }
  }
}
