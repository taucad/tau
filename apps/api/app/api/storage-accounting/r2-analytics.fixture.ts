import type { R2AnalyticsResponse } from '#api/storage-accounting/r2-analytics.js';

/**
 * A GraphQL Analytics answer in the shape Cloudflare documents for the three R2 datasets (W14 X1), with
 * Tau's two buckets, another environment's bucket and an action R2 may add later.
 */
export const r2AnalyticsFixture: R2AnalyticsResponse = {
  data: {
    viewer: {
      accounts: [
        {
          hour: [
            {
              sum: { requests: 120 },
              dimensions: {
                bucketName: 'tau-content-staging',
                actionType: 'PutObject',
                actionStatus: 'success',
              },
            },
            {
              sum: { requests: 30 },
              dimensions: {
                bucketName: 'tau-content-staging',
                actionType: 'GetObject',
                actionStatus: 'success',
              },
            },
            {
              sum: { requests: 2 },
              dimensions: {
                bucketName: 'tau-content-private-staging',
                actionType: 'HeadObject',
                actionStatus: 'userError',
              },
            },
            {
              sum: { requests: 7 },
              dimensions: {
                bucketName: 'tau-content-prod',
                actionType: 'PutObject',
                actionStatus: 'success',
              },
            },
            {
              sum: { requests: 5 },
              dimensions: {
                bucketName: 'tau-scratch',
                actionType: 'PutObject',
                actionStatus: 'success',
              },
            },
            {
              sum: { requests: 1 },
              dimensions: {
                bucketName: 'tau-content-staging',
                actionType: 'PutBucketSomething',
                actionStatus: 'odd',
              },
            },
          ],
          month: [
            {
              sum: { requests: 9000 },
              dimensions: {
                bucketName: 'tau-content-staging',
                actionType: 'PutObject',
                actionStatus: 'success',
              },
            },
            {
              sum: { requests: 40 },
              dimensions: {
                bucketName: 'tau-content-staging',
                actionType: 'DeleteObject',
                actionStatus: 'success',
              },
            },
          ],
          storage: [
            {
              max: { objectCount: 410, payloadSize: 5000, metadataSize: 100 },
              dimensions: {
                bucketName: 'tau-content-staging',
                datetime: '2026-10-28T20:00:00Z',
              },
            },
            {
              max: { objectCount: 400, payloadSize: 4000, metadataSize: 90 },
              dimensions: {
                bucketName: 'tau-content-staging',
                datetime: '2026-10-28T19:00:00Z',
              },
            },
            {
              max: { objectCount: 3, payloadSize: 300, metadataSize: 3 },
              dimensions: {
                bucketName: 'tau-content-private-staging',
                datetime: '2026-10-28T20:00:00Z',
              },
            },
            {
              max: { objectCount: 10, payloadSize: 1000, metadataSize: 10 },
              dimensions: {
                bucketName: 'tau-content-prod',
                datetime: '2026-10-28T20:00:00Z',
              },
            },
            {
              max: { objectCount: 1, payloadSize: 50, metadataSize: 1 },
              dimensions: {
                bucketName: 'tau-scratch',
                datetime: '2026-10-28T18:00:00Z',
              },
            },
          ],
          bandwidthHour: [
            {
              sum: { bytesUpload: 2_000_000, bytesDownload: 500_000 },
              dimensions: { bucketName: 'tau-content-staging' },
            },
          ],
          bandwidthMonth: [
            {
              sum: { bytesUpload: 90_000_000, bytesDownload: 7_000_000 },
              dimensions: { bucketName: 'tau-content-staging' },
            },
            {
              sum: { bytesUpload: 1, bytesDownload: 2 },
              dimensions: { bucketName: 'tau-content-prod' },
            },
          ],
        },
      ],
    },
  },
};
