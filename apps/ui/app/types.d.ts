import { ThreeElements } from '@react-three/fiber';

declare global {
  namespace React {
    namespace JSX {
      // Support for Three.js
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
      interface IntrinsicElements extends ThreeElements {}
    }

    // Add support for CSS variables in CSSProperties.
    // Currently any CSS variables are supported.
    interface CSSProperties extends CSS.Properties<string | number> {
      [key: `--${string}`]: string | number;
    }
  }
}
