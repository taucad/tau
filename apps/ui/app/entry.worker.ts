/// <reference lib="WebWorker" />

import {
  EnhancedCache,
  isDocumentRequest,
  isLoaderRequest,
  NavigationHandler,
  type DefaultFetchHandler,
} from '@remix-pwa/sw';

declare let self: ServiceWorkerGlobalScope;

self.addEventListener('install', (event) => {
  console.log('Service worker installed');

  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');

  event.waitUntil(self.clients.claim());
});

const version = 'v1';

const DOCUMENT_CACHE_NAME = `document-cache`;
const ASSET_CACHE_NAME = `asset-cache`;
const DATA_CACHE_NAME = `data-cache`;

const documentCache = new EnhancedCache(DOCUMENT_CACHE_NAME, {
  version,
  strategy: 'NetworkFirst',
  strategyOptions: {
    maxEntries: 64,
  },
});

const assetCache = new EnhancedCache(ASSET_CACHE_NAME, {
  version,
  strategy: 'NetworkFirst',
  strategyOptions: {
    maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
    maxEntries: 100,
  },
});

const dataCache = new EnhancedCache(DATA_CACHE_NAME, {
  version,
  strategy: 'NetworkFirst',
  strategyOptions: {
    networkTimeoutInSeconds: 10,
    maxEntries: 72,
  },
});

export const defaultFetchHandler: DefaultFetchHandler = async ({ context }) => {
  const request = context.event.request;
  const url = new URL(request.url);

  if (isDocumentRequest(request)) {
    return documentCache.handleRequest(request);
  }

  if (isLoaderRequest(request)) {
    return dataCache.handleRequest(request);
  }

  if (self.__workerManifest.assets.includes(url.pathname)) {
    return assetCache.handleRequest(request);
  }

  return fetch(request);
};

const messageHandler = new NavigationHandler({
  cache: documentCache,
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  event.waitUntil(messageHandler.handleMessage(event));
});
