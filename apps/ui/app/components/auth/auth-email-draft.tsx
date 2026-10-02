import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const authEmailDraftStorageKey = 'tau.auth.emailDraft';

type AuthEmailDraftContextValue = {
  readonly emailDraft: string;
  readonly setEmailDraft: (value: string) => void;
};

const AuthEmailDraftContext = createContext<AuthEmailDraftContextValue | undefined>(undefined);

export type AuthEmailDraftProviderProps = {
  readonly children: React.ReactNode;
};

const canUseSessionStorage = (): boolean => 'sessionStorage' in globalThis;

export function AuthEmailDraftProvider({ children }: AuthEmailDraftProviderProps): React.JSX.Element {
  const [emailDraft, setEmailDraftState] = useState('');

  useEffect(() => {
    if (!canUseSessionStorage()) {
      return;
    }

    setEmailDraftState(globalThis.sessionStorage.getItem(authEmailDraftStorageKey) ?? '');
  }, []);

  const setEmailDraft = useCallback((value: string) => {
    setEmailDraftState(value);

    if (!canUseSessionStorage()) {
      return;
    }

    if (value) {
      globalThis.sessionStorage.setItem(authEmailDraftStorageKey, value);
    } else {
      globalThis.sessionStorage.removeItem(authEmailDraftStorageKey);
    }
  }, []);

  const value = useMemo(() => ({ emailDraft, setEmailDraft }), [emailDraft, setEmailDraft]);

  return <AuthEmailDraftContext value={value}>{children}</AuthEmailDraftContext>;
}

export const useAuthEmailDraft = (): AuthEmailDraftContextValue => {
  const value = useContext(AuthEmailDraftContext);

  if (!value) {
    throw new Error('useAuthEmailDraft must be used within AuthEmailDraftProvider');
  }

  return value;
};
