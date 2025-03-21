import { fetchEventSource } from '@/utils/fetch-event-source/fetch';
import { useEffect, useRef } from 'react';

// EventSource implementation borrowed from `remix-util` package
// Updated to support async data decoding

export interface EventSourceOptions {
  init?: EventSourceInit;
  event?: string;
}

type UseEventSourceProperties<T> = {
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
 * @returns The stream and abortStream functions
 */
export function useEventSource<T, U>(
  properties: UseEventSourceProperties<T>,
): {
  stream: (body: U) => Promise<void>;
  abortStream: () => void;
} {
  const abortControllerReference = useRef<AbortController | undefined>(undefined);

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
          try {
            const parsedData = JSON.parse(event.data);
            properties.onStreamEvent(parsedData);
          } catch (error) {
            console.error('Failed to parse event data:', error);
          }
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

  const abortStream = () => {
    if (abortControllerReference.current) {
      abortControllerReference.current.abort();
      abortControllerReference.current = undefined;
      properties.onStreamEnd?.();
    }
  };

  useEffect(() => {
    return () => {
      if (abortControllerReference.current) {
        abortControllerReference.current.abort();
      }
    };
  }, []);

  return { stream, abortStream };
}
