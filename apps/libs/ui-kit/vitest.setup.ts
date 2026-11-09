import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);
// Testing Library only unmounts on its own when Vitest globals are on; this suite keeps them off.
afterEach(cleanup);
