import { fetchEventSource } from '@/utils/fetch-event-source/fetch';
import { useEffect, useState, createContext, useContext, useRef } from 'react';
import { ChatEvent } from './use-chat';

// EventSource implementation borrowed from `remix-util` package
// Updated to support async data decoding

export interface EventSourceOptions {
  init?: EventSourceInit;
  event?: string;
}

export type EventSourceMap = Map<string, { count: number; source: EventSource }>;

const context = createContext<EventSourceMap>(new Map<string, { count: number; source: EventSource }>());

export const EventSourceProvider = context.Provider;

type UseEventSourceProperties<T, U> = {
  url: string;
  onStreamEvent: (data: T) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onStreamError?: (error: unknown) => void;
};

/**
 * Subscribe to an event source and return the latest event.
 * @param url The URL of the event source to connect to
 * @param options The options to pass to the EventSource constructor
 * @returns The last event received from the server
 */
export function useEventSource<T, U>(properties: UseEventSourceProperties<T, U>) {
  const abortControllerReference = useRef<AbortController | null>(null);

  const stream = async (body: U) => {
    abortControllerReference.current = new AbortController();
    await fetchEventSource(properties.url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: abortControllerReference.current?.signal,
      async onopen(response) {
        properties.onStreamStart?.();
        if (response.ok && response.status === 200) {
          console.log('Connection made', response);
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.log('Client side error', response);
        }
      },
      onmessage(event) {
        if (event.data.length > 0) {
          const parsedData = JSON.parse(event.data) as T;
          properties.onStreamEvent(parsedData);
        }
      },
      onclose() {
        console.log('Connection closed by the server');
        properties.onStreamEnd?.();
      },
      onerror(error) {
        console.log('There was an error from server', error);
        properties.onStreamError?.(error);
      },
    });
  };

  useEffect(() => {
    return () => {
      console.log('abort called');
      if (abortControllerReference.current) {
        abortControllerReference.current.abort();
      }
    };
  }, []);

  return { stream };
}
