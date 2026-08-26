---
title: 'Storage Policy'
description: 'Store-selection boundary (what belongs in IndexedDB at all) plus rules for atomic read-modify-write semantics, field-scoped patches, and concurrent-writer safety in client-side persistent storage providers.'
status: active
created: '2026-04-20'
updated: '2026-08-24'
related:
  - docs/policy/project-manifest-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/xstate-policy.md
  - docs/policy/filesystem-policy.md
  - docs/policy/testing-policy.md
  - docs/research/chat-draft-resurrection-race.md
  - docs/research/project-updated-at-activity-boundary.md
  - docs/research/tau-json-project-library-state-boundary.md
---

# Storage Policy

Internal reference for how persistent storage providers (`IndexedDbStorageProvider`, future OPFS/Worker-OPFS variants, anything implementing the `StorageProvider` contract in `apps/ui/app/types/storage.types.ts`) must guarantee atomicity, isolation, and last-writer-wins semantics for the rows they manage.

## Rationale

Two independent XState actors (`persistDraftActor`, `persistMessagesActor`) used to share `IndexedDbStorageProvider.updateChat`, which performed `getChat → deepmerge → put` across two separate IndexedDB transactions with no per-`chatId` lock. When the user sent a message, the two writers raced and the message-pipeline writer's `getChat` could land inside the gap between the draft-pipeline writer's read and write, snapshotting a stale `draft` and re-saving the just-sent text. On reload, the previously sent message reappeared in the composer. See `docs/research/chat-draft-resurrection-race.md` for the full timeline.

This policy locks the fix in and prevents the same shape of bug recurring in future storage primitives or new fields on `Chat`/`ProjectLibraryState`.

## Rules

### 0. Store-selection boundary: does this data belong in IndexedDB at all?

Before applying any rule below, put the data in the right store. Portable project content stays in the project filesystem. IndexedDB is permitted only for state whose meaning is explicitly local to the browser/profile or whose authoritative data has not yet moved to the filesystem.

| Data                                                                                  | Store                                         | Governed by                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Portable project declaration                                                          | Project filesystem (`tau.json`)               | `docs/policy/project-manifest-policy.md`             |
| Entry paths, thumbnails, parameter sidecars, caches                                   | Project filesystem                            | `docs/policy/project-manifest-policy.md`             |
| Host-local project library lifecycle (`lastActivityAt`, `deletedAt`, `revisionState`) | Dedicated `projectLibraryStates` object store | This policy + manifest policy Rules 6–9              |
| Browser-local application state (chats, editor layout, resource links)                | Object store via `IndexedDbStorageProvider`   | This policy's RMW rules                              |
| Browser-local app chrome preferences (project disclosure)                             | Dedicated `appUiPreferences` object store     | This policy's RMW rules                              |
| Per-device filesystem configuration (`ProjectFileSystemConfig`, workspace handles)    | Dedicated `tau-fs-handles` database           | This policy + filesystem-authority policy Rules 9/11 |

The legacy `projects` object store remains frozen and is cleared only after each row has been converted to a verified strict-v1 filesystem project and its `updatedAt`, `deletedAt`, and `revisionState` have been mapped to verified `ProjectLibraryState`. This is legacy storage conversion, not manifest-version migration. The store must not be repurposed: its `id` key path, full-project API, and legacy cleanup race with the correct local overlay. `projectLibraryStates` is a separate store keyed by `projectId`; it may contain only the fields permitted by the manifest policy and cannot establish project existence.

Adding any other object store requires a documented parity exemption in the PR description: state why no agent, CLI, or on-disk consumer needs the data and why an existing local store cannot own it. A cache of manifest-derived fields is not exempt merely because listing is slow; measure first and keep any justified projection rebuildable and non-authoritative.

`appUiPreferences` has that parity exemption for project disclosure. Expanded/collapsed project rows are browser chrome with no meaning to agents, the CLI, project collaborators, or an on-disk project. The state cannot belong to `projectLibraryStates` because it is not lifecycle or revision data, cannot belong to `editor` because it spans project routes rather than describing one project's workbench, and cannot belong to `chats` because it is not conversation data. The store therefore contains one sparse browser-profile-local row keyed by `singleton`; clearing a permanently deleted project's field is the only lifecycle coupling.

Project recency is owned by the project-domain activity boundary and persisted as `ProjectLibraryState.lastActivityAt`. Mutating chat or editor rows must never cascade a timestamp through generic storage behavior. The project domain touches local activity only after a material project/chat operation commits; navigation repair, generated labels, startup-request consumption, thumbnail writes, caches, and other derived/system activity do not affect recency.

**Why**: Nothing else in this policy answers "should this be in IndexedDB?" — that gap is exactly how project metadata became unreachable by the agent.

**Enforced by**: `tau-lint/no-direct-indexeddb` (error) — direct `indexedDB` access outside the allowlisted provider modules fails lint, so a new store cannot appear without deliberately extending the allowlist and answering this rule.

### 1. Read-modify-write must be a single transaction

Every storage method that performs `read → mutate → write` against a single logical row must execute the read and write inside one transaction (or whatever isolation primitive the backing store provides). Resolve the outer `Promise` from `transaction.oncomplete`, never from `request.onsuccess`, so callers never observe a value before durability.

**Why**: Splitting the read and write across two IndexedDB transactions opens a window in which another writer can land a `put`, which is then silently overwritten when the first writer commits its stale-merged row.

CORRECT:

```typescript
return new Promise((resolve, reject) => {
  const transaction = db.transaction(this.chatsStoreName, 'readwrite');
  const store = transaction.objectStore(this.chatsStoreName);
  let resolved: Chat | undefined;

  const getRequest = store.get(chatId);
  getRequest.onsuccess = () => {
    const existingChat = getRequest.result as Chat | undefined;
    if (!existingChat) return;
    const next = mutate(existingChat);
    const putRequest = store.put(next);
    putRequest.onsuccess = () => {
      resolved = next;
    };
  };

  transaction.oncomplete = () => {
    db.close();
    resolve(resolved);
  };
});
```

INCORRECT:

```typescript
const existing = await this.getChat(chatId);
if (!existing) return undefined;
const next = mutate(existing);
const db = await this.getDb();
return new Promise((resolve, reject) => {
  const transaction = db.transaction(this.chatsStoreName, 'readwrite');
  transaction.objectStore(this.chatsStoreName).put(next);
  transaction.oncomplete = () => resolve(next);
});
```

### 2. Per-row in-process serialisation

Every mutating method must funnel through a per-row keyed mutex (`apps/ui/app/db/keyed-mutex.ts`) before opening its transaction. Two concurrent callers for the same `chatId`/`projectId` must execute in submission order; concurrent callers for different keys must run in parallel.

**Why**: Defence in depth on top of rule 1. Some backends (in-memory mocks, future remote sync workers, cross-tab proxies) cannot rely on transactional isolation alone. The mutex also gives `CrossTabCoordinator` and any future invalidation channel a single chokepoint.

CORRECT:

```typescript
public async updateChat(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> {
  return this.mutex.run(chatId, async () => this.updateChatAtomic(chatId, update));
}
```

INCORRECT:

```typescript
public async updateChat(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> {
  return this.updateChatAtomic(chatId, update);
}
```

### 3. Prefer field-scoped helpers over partial merges

For every named slot on `Chat` or `ProjectLibraryState` that is updated by more than one writer, expose a field-scoped helper (`patchChat`, `setMessageEdit`, `clearMessageEdit`, `softDeleteChat`, `touchProjectActivity`, …) and call that from production code. Reserve full-row replacement for explicit import/bootstrap paths.

**Why**: A partial-merge writer reads the entire row and re-`put`s the entire row. Even with rule 1, the call site is still expressing "I read everything, I write everything", which makes future fields silently vulnerable as soon as a second writer appears. Field-scoped helpers make the blast radius equal to the named slot.

CORRECT:

```typescript
await patchChat(input.chatId, 'draft', input.draft);
await setMessageEdit(input.chatId, input.messageId, input.draft);
await clearMessageEdit(input.chatId, input.messageId);
```

INCORRECT:

```typescript
await updateChat(input.chatId, { draft: input.draft }, { ignoreKeys: ['draft'] });
await updateChat(input.chatId, { messageEdits: { [input.messageId]: input.draft } });
```

### 4. No `ignoreKeys` / `customMerge` escape hatches

Storage methods must not expose `ignoreKeys`, `customMerge`, or any other "skip the deep merge for this field" knob. If a caller needs target-wins semantics, they must either replace the full row (and own that responsibility) or call a field-scoped helper.

**Why**: `ignoreKeys` solves a merge-shape problem; it does not solve a transactional-isolation problem. Allowing it tempts callers to think "I added the key to ignoreKeys so I'm safe", which is exactly the bug pattern the policy exists to prevent.

INCORRECT:

```typescript
updateChat(
  chatId: string,
  update: PartialDeep<Chat>,
  options?: { ignoreKeys?: string[]; preserveUpdatedAt?: boolean },
): Promise<Chat | undefined>;
```

### 5. Bump `updatedAt` only on real mutations

Storage mutators must compute the candidate row before stamping. If the candidate is equal to the persisted row, return `undefined`, skip `put`, skip row `updatedAt`, and skip parent-project cascades. Field-scoped helpers express this with a `(chat) => boolean` mutator: returning `false` means "nothing changed".

**Why**: `updatedAt` drives sort order and React Query invalidation. A no-op clear, patch, generated-name retry, or load repair should not reorder the list.

CORRECT:

```typescript
this.atomicChatMutation(chatId, (chat) => {
  if (!chat.messageEdits || !(messageId in chat.messageEdits)) return false;
  delete chat.messageEdits[messageId];
  return true;
});
```

### 6. Project recency belongs to the project domain boundary

Do not add low-level timestamp flags to storage, filesystem, worker, or hook APIs. Project naming resolves before project creation; generated chat metadata and navigation repair use semantic operations (`applyGeneratedChatName`, `createNavigationRepairChat`). User/content activity enters through project-domain operations such as project rename, chat message persistence, parameter changes, or `projectFileActivity`, then calls the field-scoped `touchProjectActivity` writer.

`lastActivityAt` is not a generic row `updatedAt` and is never computed from filesystem mtimes. A no-op activity call must skip its write and invalidation. The one-off audited pre-release workspace snapshot seeds known projects from their old semantic `updatedAt` while discovery is quiesced; first discovery of any other valid project may seed it to discovery time.

**Why**: Callers should describe intent, not negotiate whether a project list should reorder. Generic recency-preservation flags leak project-domain semantics into substrates and recreate the navigation-jump bug class.

### 7. Concurrent regression coverage is mandatory for new fields

When a new field is added to `Chat` or `ProjectLibraryState` and is written by more than one actor or hook, add a concurrency regression test in `apps/ui/app/db/indexeddb-storage.test.ts` that fires both writers `Promise.all`-style for at least 100 iterations against a fresh row and asserts every writer's last-written value is preserved.

**Why**: The original draft-resurrection bug was timing-dependent and a single-shot test passed by luck. The 100+-iteration loop is the only reliable way to expose the race in a deterministic test runner.

Reference template:

```typescript
for (let i = 0; i < iterations; i++) {
  const text = `iter-${i}`;
  await Promise.all([
    provider.patchChat(chat.id, 'draft', draftMessage(text)),
    provider.patchChat(chat.id, 'messages', [userMessage(text)]),
  ]);
  const final = await provider.getChat(chat.id);
  expect(final?.draft).toMatchObject({ parts: [{ type: 'text', text }] });
  expect(final?.messages[0]?.parts[0]).toEqual({ type: 'text', text });
}
```

### 8. Hooks invalidate React Query after material mutations

Every hook wrapper around a storage mutation (`useChats`, `useProjects`, `useProjectManager`) must invalidate collection and row queries only when the storage operation returns an updated row, except create/delete operations whose observable membership changes. Field-scoped helpers must not skip invalidation just because the touched field is "small", but they must skip invalidation when storage returns `undefined` for a no-op.

**Why**: Storage atomicity is necessary but not sufficient: the UI cache must converge to new values, while no-op writes must not trigger refetches that can resurrect stale order or hide the absence of a real mutation.

CORRECT:

```typescript
const patchChat = useCallback(
  async <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]) => {
    const updated = await patchChatInManager(chatId, key, value);
    if (!updated) return undefined;
    void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
    void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    return updated;
  },
  [patchChatInManager, queryClient, resourceId],
);
```

## Anti-Patterns

- Creating a new object store (or new fields on the frozen `projects` store) for portable project content. Per Rule 0 that data lives in the project filesystem.
- Adding manifest-derived name, description, author, tags, assets, entry paths, thumbnails, or locators to `projectLibraryStates`.
- Using a `projectLibraryStates` row to make a project exist, or deleting the row because a workspace was temporarily inaccessible.
- Calling `await getChat(id)` followed by `await updateChat(id, mutated)` from a hook or actor. Use a field-scoped helper instead — the manual `read → mutate → write` re-introduces the original race even though the storage layer is now atomic.
- Adding a new option flag to `updateChat`/`updateProject` to "preserve" or "skip" a field. Add a field-scoped helper instead.
- Adding project-recency preservation flags to storage or filesystem APIs. Add a semantic domain operation instead.
- Wrapping `provider.updateChat` in `Promise.all([...])` in production code without confirming each writer touches a disjoint slot. Concurrent writers to the same slot must agree on a last-writer-wins serialisation point upstream.
- Mocking `IndexedDbStorageProvider` in unit tests instead of using the real provider with `fake-indexeddb/auto`. The race shows up in the real provider, not in mocks.

## Decision Table: which API to use

| Scenario                                       | API to call                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Single top-level field on a chat               | `patchChat(chatId, key, value)`                               |
| Single entry in `chat.messageEdits`            | `setMessageEdit(chatId, messageId, draft)`                    |
| Remove a single entry in `chat.messageEdits`   | `clearMessageEdit(chatId, messageId)`                         |
| Soft-delete a chat                             | `softDeleteChat(chatId)` (`deleteChat` forwards to this)      |
| Full chat replacement (e.g. import, duplicate) | `updateChat(chatId, fullChat)` with `fullChat.id === chatId`  |
| Generated chat label                           | `applyGeneratedChatName(chatId, name)`                        |
| Navigation repair empty chat                   | `createNavigationRepairChat(projectId)`                       |
| Material project activity                      | `touchProjectActivity(projectId, timestamp)`                  |
| Soft-delete / restore project                  | `trashProject(projectId)` / `restoreProject(projectId)`       |
| Revision pointer                               | `setProjectRevisionState(projectId, revisionState)`           |
| Permanent project deletion                     | Journaled filesystem delete, then `deleteProjectLibraryState` |
| Portable project metadata                      | Project manifest writer, never an object-store patch          |
| Project name before creation                   | Semantic naming request, then strict manifest creation        |

## Summary Checklist

Before merging a storage-layer change:

- [ ] The data belongs in this store per Rule 0 — portable project content goes to the filesystem; only explicit host-local lifecycle state uses `projectLibraryStates`.
- [ ] Read and write happen inside one transaction; outer promise resolves on `transaction.oncomplete`.
- [ ] All public mutators go through `KeyedMutex.run(rowId, …)`.
- [ ] New multi-writer fields have field-scoped helpers, not extra `updateChat` options.
- [ ] No `ignoreKeys`/`customMerge` knob is reintroduced.
- [ ] Row `updatedAt` values and project `lastActivityAt` change only for their separately defined material mutations.
- [ ] Derived metadata and navigation repair use semantic operations, not timestamp flags.
- [ ] A concurrency regression test in `apps/ui/app/db/indexeddb-storage.test.ts` covers the new field with ≥100 iterations.
- [ ] React Query invalidation hits both collection and row keys only when a material row change occurred, except create/delete membership changes.

## References

- Research: `docs/research/chat-draft-resurrection-race.md`
- Implementation: `apps/ui/app/db/indexeddb-storage.ts`, `apps/ui/app/db/keyed-mutex.ts`
- Contract: `apps/ui/app/types/storage.types.ts`
- Hook surfaces: `apps/ui/app/hooks/use-chats.ts`, `apps/ui/app/hooks/use-project-manager.tsx`, `apps/ui/app/hooks/use-chat.tsx`
- Related: `docs/policy/xstate-policy.md`, `docs/policy/filesystem-policy.md`, `docs/policy/testing-policy.md`
