import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { SignOut } from '#components/auth/sign-out.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';

const sectionKeys = [
  `tau-${cookieName.personProfile}`,
  `tau-${cookieName.viewerPreferences}`,
  `tau-${cookieName.onboarding}`,
  `tau-${cookieName.device}`,
];
const storedSections = (): Record<string, string | undefined> =>
  Object.fromEntries(sectionKeys.map((key) => [key, globalThis.localStorage.getItem(key) ?? undefined]));

let callbacks: { onSuccess: () => void } | undefined;

vi.mock('#providers/financial-session-provider.js', () => ({
  useOptionalFinancialSession: () => ({ purge: vi.fn(), bind: vi.fn(), capture: vi.fn() }),
}));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    localization: { auth: { signOut: 'Sign out' } },
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate: vi.fn(),
  }),
  useSignOut: (_client: unknown, options: { onSuccess: () => void }) => {
    callbacks = options;
    return { mutate: vi.fn() };
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.localStorage.clear();
});

describe('the person record across sign-out', () => {
  it('belongs to the browser profile: signing out changes no stored value', () => {
    vi.stubGlobal('location', { replace: vi.fn() });
    const person = renderHook(() => usePersonRecord());
    const device = renderHook(() => useDeviceRecord());
    act(() => {
      person.result.current.writeProfile({ goals: ['art'], tool: 'blender' });
      person.result.current.writeViewer({ gizmo: { style: 'axis-balls' } });
      person.result.current.writeOnboarding({ setupStatus: 'completed', seenAdd: ['ask'] });
      device.result.current.writeDevice({ tourPaused: true });
    });
    const before = storedSections();
    expect(Object.values(before).every((raw) => raw !== undefined)).toBe(true);

    render(<SignOut />);
    act(() => {
      callbacks?.onSuccess();
    });

    expect(storedSections()).toEqual(before);
    expect(person.result.current.profile).toEqual({ version: 1, goals: ['art'], tool: 'blender', languages: [] });
    expect(device.result.current.device).toEqual({ version: 1, tourPaused: true });
  });
});
