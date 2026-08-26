import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { GeometryComponentReference } from '@taucad/types';
import type { ChipType } from '#components/chat/context-chip.js';

export type ChatContextReference = {
  id: string;
  label: string;
  chipType: ChipType;
  path?: string;
  referenceToken?: string;
  geometryReference?: GeometryComponentReference;
};

type ChatContextInsertionContextValue = {
  addContextReferences: (references: ChatContextReference[]) => void;
  registerContextReferenceInserter: (inserter: ((references: ChatContextReference[]) => void) | undefined) => void;
};

const ChatContextInsertionContext = createContext<ChatContextInsertionContextValue | undefined>(undefined);

export function geometryReferenceToToken(reference: GeometryComponentReference): string {
  return `@cad[${reference.filePath}#${reference.componentId}]`;
}

export function ChatContextInsertionProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const inserterRef = useRef<((references: ChatContextReference[]) => void) | undefined>(undefined);

  const registerContextReferenceInserter = useCallback(
    (inserter: ((references: ChatContextReference[]) => void) | undefined) => {
      inserterRef.current = inserter;
    },
    [],
  );

  const addContextReferences = useCallback((references: ChatContextReference[]) => {
    inserterRef.current?.(references);
  }, []);

  const value = useMemo(
    () => ({ addContextReferences, registerContextReferenceInserter }),
    [addContextReferences, registerContextReferenceInserter],
  );

  return <ChatContextInsertionContext.Provider value={value}>{children}</ChatContextInsertionContext.Provider>;
}

export function useChatContextInsertion(): ChatContextInsertionContextValue {
  const context = useContext(ChatContextInsertionContext);
  if (!context) {
    return {
      addContextReferences: () => undefined,
      registerContextReferenceInserter: () => undefined,
    };
  }
  return context;
}
