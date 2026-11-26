import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { useSession } from '@better-auth-ui/react';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { projectNameFromPrompt, projectNameFromReply } from '@taucad/files-ui/utils/project-name.utils';
import { defaultProjectName } from '@taucad/ui-core/constants/project-names';
import { namingImageUrls } from '@taucad/project-library/runtime/project-library-commands';
import type { InitialMessageAttachment } from '@taucad/project-library/runtime/project-library-commands';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { authClient } from '#lib/auth-client.js';

/** A draft as the name request reads it: its text and its stored attachments. */
export type NameAheadDraft = Readonly<{ text: string; attachments: readonly InitialMessageAttachment[] }>;

/** Asks for a name for a draft under a draft-scoped project id; resolves to the model's reply. */
export type NameAheadRequest = (
  draft: NameAheadDraft,
  context: Readonly<{ projectId: string; signal: AbortSignal }>,
) => Promise<string>;

/** What the composer reads from name ahead. */
export type ProjectNameAhead = Readonly<{
  /** Note the draft changed; `pasted` asks at once instead of after the pause. */
  update: (draft: NameAheadDraft, pasted: boolean) => void;
  /**
   * The name for a submitted draft, at once (WP-12 step 1, ruling O-1): the latest name generated for this draft, used
   * for both the display name and the slug; with none answered yet, a name made from the prompt's first words. A request
   * still in flight is not waited for and renames nothing later. `undefined` only for an empty draft.
   */
  take: (draft: NameAheadDraft) => string | undefined;
  /** Ask through `next` from now on, keeping the draft's state and its cap. */
  replaceRequest: (next: NameAheadRequest) => void;
  dispose: () => void;
}>;

/** How long a draft is still before its name is asked for (C1). Milliseconds. */
export const nameAheadPause = 400;
/** At most this many name requests per draft (C1, ruling Q2). */
export const nameAheadRequestsPerDraft = 3;
const minimumWords = 3;

type Named = { readonly text: string; readonly attachments: string; name: Promise<string | undefined> };

const attachmentsKey = (attachments: NameAheadDraft['attachments']): string =>
  attachments.map((attachment) => attachment.hash).join(',');

/** A name made for `named` is kept for `text` only if `text` extends it, past a whole word, to at most twice its length (C1). */
const covers = (named: Named, text: string, attachments: string): boolean =>
  named.attachments === attachments &&
  text.startsWith(named.text) &&
  (text.length === named.text.length || !/[\p{L}\p{N}_]/u.test(text.charAt(named.text.length))) &&
  named.text.length * 2 >= text.length;

/**
 * Whether a name made for `named` still names `submitted`: the two agree on at least half of the shorter one, from the
 * start. Text added or edited at the end keeps the name; a prompt rewritten from its start does not (WP-12 step 1).
 */
const namesSameDraft = (named: string, submitted: string): boolean => {
  let shared = 0;
  while (shared < named.length && shared < submitted.length && named[shared] === submitted[shared]) {
    shared += 1;
  }
  return shared * 2 >= Math.min(named.length, submitted.length);
};

/**
 * Name ahead (C1): asks for a new project's name while its prompt is written, so the create that follows finds it
 * held. One request in flight, a newer one aborting it, at most three per draft; the answer is kept with the text it
 * named. A submit takes the latest answer at once and never waits (WP-12 step 1). A draft cleared to empty starts a new
 * draft.
 *
 * @param initialRequest - Asks for one name, until `replaceRequest` swaps it.
 * @returns The draft's name-ahead state.
 */
export const createProjectNameAhead = (initialRequest: NameAheadRequest): ProjectNameAhead => {
  let request = initialRequest;
  let latest: (Named & { readonly controller: AbortController }) | undefined;
  /* The latest name any request of this draft answered with, and the text and attachments it named: what a submit
   * takes. */
  let answered: { readonly text: string; readonly attachments: string; readonly name: string } | undefined;
  let requests = 0;
  let projectId = generatePrefixedId(idPrefix.project);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const nameFor = async (entry: Named & { readonly controller: AbortController }, draft: NameAheadDraft) => {
    let name: string | undefined;
    try {
      const reply = await request({ ...draft, text: entry.text }, { projectId, signal: entry.controller.signal });
      /* The reply is a model's text, not a name: only its first line, fitted to the manifest, is kept. */
      name = projectNameFromReply(reply) || undefined;
    } catch {
      name = undefined;
    }
    /* A failed answer is not held, so a later pause may ask again within the cap. */
    if (name === undefined && latest === entry) {
      latest = undefined;
    }
    /* Only an answer for the current draft is kept: a request superseded by a cleared draft is aborted above. */
    if (name !== undefined && !entry.controller.signal.aborted) {
      answered = { text: entry.text, attachments: entry.attachments, name };
    }
    return name;
  };

  const ask = (draft: NameAheadDraft, text: string, attachments: string): void => {
    /* A newer request supersedes the one in flight; an answer already held stays the draft's latest until it lands. */
    latest?.controller.abort();
    requests += 1;
    const entry = {
      text,
      attachments,
      controller: new AbortController(),
      name: Promise.resolve<string | undefined>(undefined),
    };
    entry.name = nameFor(entry, draft);
    latest = entry;
  };

  return {
    update(draft, pasted) {
      clearTimeout(timer);
      const text = draft.text.trim();
      if (text === '') {
        latest?.controller.abort();
        latest = undefined;
        answered = undefined;
        requests = 0;
        projectId = generatePrefixedId(idPrefix.project);
        return;
      }
      const attachments = attachmentsKey(draft.attachments);
      if (
        text.split(/\s+/).length < minimumWords ||
        requests >= nameAheadRequestsPerDraft ||
        (latest !== undefined && covers(latest, text, attachments))
      ) {
        return;
      }
      if (pasted) {
        ask(draft, text, attachments);
      } else {
        timer = setTimeout(() => {
          ask(draft, text, attachments);
        }, nameAheadPause);
      }
    },
    take(draft): string | undefined {
      clearTimeout(timer);
      const text = draft.text.trim();
      if (text === '') {
        return undefined;
      }
      /* Never a request at creation, and never a wait on one in flight: the send goes now. */
      /* A name for other attachments is another draft's, however close its text. */
      return answered !== undefined &&
        answered.attachments === attachmentsKey(draft.attachments) &&
        namesSameDraft(answered.text, text)
        ? answered.name
        : projectNameFromPrompt(text) || defaultProjectName;
    },
    replaceRequest(next) {
      request = next;
    },
    dispose() {
      clearTimeout(timer);
      latest?.controller.abort();
    },
  };
};

type NamingSources = Readonly<{
  generate: ReturnType<typeof useProjectNameClient>['generate'];
  recordFiles: ReturnType<typeof useFileManager>['recordFiles'];
  attachmentSource: ReturnType<typeof useChatComposer>['attachmentSource'];
}>;

/** A name request through the composer's naming sources. */
const requestThrough =
  ({ generate, recordFiles, attachmentSource }: NamingSources): NameAheadRequest =>
  async (draft, { projectId, signal }) =>
    generate({
      projectId,
      signal,
      text: draft.text,
      imageUrls: await namingImageUrls(recordFiles, { attachments: draft.attachments, attachmentSource }),
    });

/**
 * Name ahead for the composer's draft (C1). Signed out, nothing is asked: the request is a funded `title` operation
 * on the person's account.
 *
 * @returns The submit-time `take`, and the paste listener that makes the next change ask at once.
 */
export function useProjectNameAhead(): Readonly<{
  take: ProjectNameAhead['take'];
  onPasteCapture: () => void;
}> {
  const { data: session } = useSession(authClient);
  const isSignedIn = session?.user !== undefined;
  const { draftActorRef, attachmentSource } = useChatComposer();
  const { recordFiles } = useFileManager();
  const { generate } = useProjectNameClient();
  const text = useSelector(draftActorRef, (state) => state.context.draftText);
  const attachments = useSelector(draftActorRef, (state) => state.context.draftAttachments);
  /* Only text the person changed in this composer is named ahead: a record hydrated in is not (C1). */
  const written = useSelector(draftActorRef, (state) => state.context.touched.draft);
  /* One per mounted composer: a dependency changing identity swaps the request, so the draft keeps its cap. */
  const [nameAhead] = useState(() =>
    createProjectNameAhead(requestThrough({ generate, recordFiles, attachmentSource })),
  );
  useEffect(() => {
    nameAhead.replaceRequest(requestThrough({ generate, recordFiles, attachmentSource }));
  }, [attachmentSource, generate, nameAhead, recordFiles]);
  useEffect(
    () => () => {
      nameAhead.dispose();
    },
    [nameAhead],
  );
  const pasted = useRef(false);
  /* A draft restored on mount was not written here: it is asked about only once the person changes it. */
  const restored = useRef<string | undefined>(text);
  useEffect(() => {
    const isPaste = pasted.current;
    pasted.current = false;
    if (restored.current !== undefined) {
      if (text === restored.current) {
        return;
      }
      restored.current = undefined;
    }
    if (isSignedIn && written) {
      nameAhead.update({ text, attachments }, isPaste);
    }
  }, [attachments, isSignedIn, nameAhead, text, written]);
  return useMemo(
    () => ({
      take: nameAhead.take,
      onPasteCapture() {
        pasted.current = true;
      },
    }),
    [nameAhead],
  );
}
