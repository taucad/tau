import { ThreeElements } from '@react-three/fiber';

declare global {
  namespace React {
    namespace JSX {
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface -- This is a valid implementation for Three.js
      interface IntrinsicElements extends ThreeElements {}
    }

    // Add support for CSS variables in CSSProperties.
    // Currently any CSS variables are supported.
    interface CSSProperties extends CSS.Properties<string | number> {
      [key: `--${string}`]: string | number;
    }
  }
}
