import process from 'node:process';

const configured = process.env['BASE_URL'];
const candidate =
  configured?.startsWith('/') === false
    ? configured.includes('://')
      ? configured
      : `http://${configured}`
    : undefined;

export const testBaseURL =
  candidate && URL.canParse(candidate)
    ? new URL(candidate).origin
    : `http://localhost:${process.env['PORT'] ?? '3011'}`;

export const testPort = process.env['PORT'] ?? new URL(testBaseURL).port;
