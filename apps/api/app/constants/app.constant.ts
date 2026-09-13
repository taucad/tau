import type { ConstantRecord } from '@taucad/types';

export const logServiceProvider = {
  console: 'console',
  fly: 'fly',
  googleLogging: 'google-logging',
  awsCloudwatch: 'aws-cloudwatch',
} as const satisfies Record<string, string>;

export type LogServiceProvider = ConstantRecord<typeof logServiceProvider>;

export const orderBy = {
  asc: 'asc',
  desc: 'desc',
} as const;

export type OrderBy = ConstantRecord<typeof orderBy>;

// Redact value of these paths from logs
export const loggingRedactPaths = [
  'req.headers.authorization',
  // The Basic→bearer translation on the git routes moves an `sk_…` key here,
  // and the git proxy carries a third-party token in its own header; both are
  // live credentials and neither is covered by `authorization`.
  'req.headers["x-api-key"]',
  'req.headers["x-tau-proxy-authorization"]',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.email',
  'req.body.password',
  'req.body.oldPassword',
];
export const redactionCensor = '**REDACTED**';

export const defaultPageLimit = 10;
export const defaultCurrentPage = 1;
