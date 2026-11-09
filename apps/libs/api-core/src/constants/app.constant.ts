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
  'req.headers["x-tau-lfs-key"]',
  'req.headers["tau-zoo-token"]',
  // DC1: the storage grant (API to tau-storage) and the receipt tau-storage
  // posts back are signed bearer facts; neither belongs in a log line.
  'req.headers["tau-storage-grant"]',
  'req.body.receipt',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  // A sign-in's response carries the new session token twice; both are live credentials.
  'res.headers["set-cookie"]',
  'res.headers["set-auth-token"]',
  'req.body.token',
  'req.body.device_code',
  'req.body.userCode',
  'res.body.access_token',
  'req.body.refreshToken',
  'req.body.email',
  'req.body.password',
  'req.body.oldPassword',
  // Client addresses: the edge and Fly's proxy forward the caller's IP in these headers. Request logs keep the
  // request id for correlation; abuse limits read the address from the request itself, never from a log.
  'req.headers["x-forwarded-for"]',
  'req.headers["fly-client-ip"]',
  'req.headers["x-real-ip"]',
  'req.headers.forwarded',
  'req.headers["cf-connecting-ip"]',
  'req.headers["true-client-ip"]',
  'req.headers["x-nf-client-connection-ip"]',
];
export const redactionCensor = '**REDACTED**';

// OAuth callbacks carry a single-use `code` and `state` in the query; request logs keep only these paths.
export const loggingRedactQueryPaths: readonly RegExp[] = [
  /^\/v1\/auth\/device\/?$/iu,
  /^\/v1\/github\/callback\/?$/iu,
  /^\/v1\/auth\/callback\/[^/]+\/?$/iu,
];

export const defaultPageLimit = 10;
export const defaultCurrentPage = 1;
