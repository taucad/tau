import * as target from '#support/external-target.js';

/** Install deterministic AI responses and, when requested, a genuine OPFS directory picker result. */
export const installProjectCreationFixture = async (options: {
  readonly projectName: string;
  readonly pickerFixture?: string;
}): Promise<void> => {
  await target.addInitScript(({ pickerFixture, projectName }) => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith('/v1/chat')) {
        return nativeFetch(input, init);
      }
      const bodyText =
        typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '{}';
      const body = JSON.parse(bodyText) as { agent?: { profile?: string } };
      const text =
        body.agent?.profile === 'project_name'
          ? projectName
          : body.agent?.profile === 'commit_name'
            ? 'feat: browser fixture'
            : 'Project created.';
      const events = [
        { type: 'start' },
        { type: 'text-start', id: 'text-0' },
        { type: 'text-delta', id: 'text-0', delta: text },
        { type: 'text-end', id: 'text-0' },
        { type: 'finish' },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
      });
    };
    if (pickerFixture) {
      Object.defineProperty(globalThis, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          const root = await navigator.storage.getDirectory();
          return root.getDirectoryHandle(pickerFixture, { create: true });
        },
      });
    }
  }, options);
};
