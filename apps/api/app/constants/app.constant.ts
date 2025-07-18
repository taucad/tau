import type { ConstantRecord } from '~/types/constant.types.js';

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
