import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);
// Testing Library only unmounts on its own when Vitest globals are on; generated suites keep them off.
afterEach(cleanup);
