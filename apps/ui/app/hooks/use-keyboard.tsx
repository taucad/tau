import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { formatKeyCombination, setPlatform, getPlatform } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { detectPlatform } from '#utils/platform.utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Global modifier key state, updated by a single set of window-level listeners.
 */
export type ModifierState = {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
};

type KeybindingOptions = {
  /** Call `event.preventDefault()` when matched. Default: `true`. */
  preventDefault?: boolean;
  /** Call `event.stopPropagation()` on the DOM event when matched. Default: `true`. */
  stopPropagation?: boolean;
  /** Fire on `event.repeat` (held key). Default: `false`. */
  repeat?: boolean;
  /**
   * When `true`, the callback will **not** fire if the event target is an
   * editable element (input, textarea, contenteditable, etc.).
   * Default: `false` (shortcuts are suppressed inside editable targets).
   */
  ignoreInputs?: boolean;
  /** Dynamic enable/disable. Default: `true`. */
  enabled?: boolean | (() => boolean);
  /** Higher priority fires first. Default: `0`. */
  priority?: number;
  /** `'global'` fires everywhere; `'app'` is suppressed inside dialogs. Default: `'app'`. */
  scope?: 'global' | 'app';
  /** When `true`, prevents lower-priority handlers for the same combo from firing. Default: `true`. */
  consume?: boolean;
};

type KeybindingRegistration = {
  id: symbol;
  callbackRef: React.RefObject<(event: KeyboardEvent) => void>;
  options: Required<KeybindingOptions>;
};

type KeyboardContextValue = {
  modifiers: ModifierState;
  register: (combo: string, registration: KeybindingRegistration) => void;
  unregister: (combo: string, id: symbol) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const initialModifiers: ModifierState = {
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
};

const defaultOptions: Required<KeybindingOptions> = {
  preventDefault: true,
  stopPropagation: true,
  repeat: false,
  ignoreInputs: false,
  enabled: true,
  priority: 0,
  scope: 'app',
  consume: true,
};

/**
 * Non-editable input types that should not suppress shortcuts.
 */
const nonEditableInputTypes = new Set(['button', 'submit', 'reset', 'checkbox', 'radio']);

/**
 * Selector for scoped containers where 'app'-scoped shortcuts are suppressed.
 */
const scopedContainerSelector = '[role="dialog"], [role="alertdialog"], [data-slot="command-dialog"]';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const KeyboardContext = createContext<KeyboardContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a KeyCombination into a stable registry key.
 * Resolves `modKey` to the platform-specific modifier.
 */
function serializeCombo(combo: KeyCombination): string {
  const isMac = getPlatform() === 'mac';
  const parts: string[] = [];

  // Resolve modKey
  const ctrl = combo.modKey ? !isMac : Boolean(combo.ctrlKey);
  const meta = combo.modKey ? isMac : Boolean(combo.metaKey);

  if (ctrl) {
    parts.push('ctrl');
  }

  if (meta) {
    parts.push('meta');
  }

  if (combo.altKey) {
    parts.push('alt');
  }

  if (combo.shiftKey) {
    parts.push('shift');
  }

  parts.push(combo.key.toLowerCase());

  return parts.join('+');
}

/**
 * Serialize a KeyboardEvent into the same format as serializeCombo.
 */
function serializeEvent(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push('ctrl');
  }

  if (event.metaKey) {
    parts.push('meta');
  }

  if (event.altKey) {
    parts.push('alt');
  }

  if (event.shiftKey) {
    parts.push('shift');
  }

  parts.push(event.key.toLowerCase());

  return parts.join('+');
}

/**
 * Check if the event target is an editable element.
 */
function isEditableTarget(target: EventTarget | undefined): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const { tagName } = target;

  if (tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (tagName === 'INPUT') {
    const inputType = (target as HTMLInputElement).type.toLowerCase();

    return !nonEditableInputTypes.has(inputType);
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest('[role="textbox"]')) {
    return true;
  }

  return false;
}

/**
 * Check if the event target is inside a scoped container (dialog, etc.).
 */
function isInsideScopedContainer(target: EventTarget | undefined): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest(scopedContainerSelector) !== null;
}

/**
 * Read modifier state from a keyboard event using getModifierState.
 */
function readModifiersFromKeyboardEvent(event: KeyboardEvent): ModifierState {
  return {
    shift: event.getModifierState('Shift'),
    ctrl: event.getModifierState('Control'),
    alt: event.getModifierState('Alt'),
    meta: event.getModifierState('Meta'),
  };
}

/**
 * Read modifier state from a pointer/mouse event.
 */
function readModifiersFromPointerEvent(event: PointerEvent | MouseEvent): ModifierState {
  return {
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
}

/**
 * Shallow compare two ModifierState objects.
 */
function modifiersEqual(a: ModifierState, b: ModifierState): boolean {
  return a.shift === b.shift && a.ctrl === b.ctrl && a.alt === b.alt && a.meta === b.meta;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Global keyboard service provider.
 *
 * Attaches a single set of window-level listeners for modifier state tracking
 * and keybinding dispatch. Must be placed near the root of the React tree.
 */
export function KeyboardProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [modifiers, setModifiers] = useState<ModifierState>(initialModifiers);
  const modifiersRef = useRef<ModifierState>(initialModifiers);
  const registryRef = useRef(new Map<string, Set<KeybindingRegistration>>());

  // Stable register/unregister functions
  const register = useCallback((combo: string, registration: KeybindingRegistration): void => {
    const map = registryRef.current;
    let set = map.get(combo);

    if (!set) {
      set = new Set();
      map.set(combo, set);
    }

    set.add(registration);
  }, []);

  const unregister = useCallback((combo: string, id: symbol): void => {
    const set = registryRef.current.get(combo);

    if (!set) {
      return;
    }

    for (const reg of set) {
      if (reg.id === id) {
        set.delete(reg);
        break;
      }
    }

    if (set.size === 0) {
      registryRef.current.delete(combo);
    }
  }, []);

  useEffect(() => {
    // Detect and set platform on mount
    const platform = detectPlatform();
    setPlatform(platform);

    /**
     * Update modifier state, only triggering a React re-render when values actually change.
     */
    const updateModifiers = (next: ModifierState): void => {
      if (!modifiersEqual(modifiersRef.current, next)) {
        modifiersRef.current = next;
        setModifiers(next);
      }
    };

    /**
     * Handle keydown: update modifiers + dispatch matching keybindings.
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      const nextModifiers = readModifiersFromKeyboardEvent(event);
      updateModifiers(nextModifiers);

      // IME guard -- skip all matching during composition
      if (event.isComposing) {
        return;
      }

      // Serialize event and look up registrations
      const comboKey = serializeEvent(event);
      const registrations = registryRef.current.get(comboKey);

      if (!registrations || registrations.size === 0) {
        return;
      }

      // Sort by priority descending (stable)
      const sorted = [...registrations].sort((a, b) => b.options.priority - a.options.priority);

      for (const reg of sorted) {
        // Enabled check
        const isEnabled = typeof reg.options.enabled === 'function' ? reg.options.enabled() : reg.options.enabled;

        if (!isEnabled) {
          continue;
        }

        // Repeat guard
        if (event.repeat && !reg.options.repeat) {
          continue;
        }

        // Input guard
        if (reg.options.ignoreInputs && isEditableTarget(event.target ?? undefined)) {
          continue;
        }

        // Scope guard
        if (reg.options.scope === 'app' && isInsideScopedContainer(event.target ?? undefined)) {
          continue;
        }

        // Fire callback
        reg.callbackRef.current(event);

        // Apply DOM event modifications
        if (reg.options.preventDefault) {
          event.preventDefault();
        }

        if (reg.options.stopPropagation) {
          event.stopPropagation();
        }

        // Consume check
        if (reg.options.consume) {
          break;
        }
      }
    };

    /**
     * Handle keyup: update modifiers only.
     */
    const handleKeyUp = (event: KeyboardEvent): void => {
      updateModifiers(readModifiersFromKeyboardEvent(event));
    };

    /**
     * Handle blur: reset all modifiers (fixes stuck keys on app/tab switch).
     */
    const handleBlur = (): void => {
      updateModifiers(initialModifiers);
    };

    /**
     * Handle visibility change: reset modifiers when tab hidden.
     */
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        updateModifiers(initialModifiers);
      }
    };

    /**
     * Handle pointer down: sync modifiers from pointer event
     * (catches drift from missed keyboard events, e.g., modifier pressed in iframe).
     */
    const handlePointerDown = (event: PointerEvent): void => {
      updateModifiers(readModifiersFromPointerEvent(event));
    };

    // Attach single set of listeners
    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    globalThis.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('pointerdown', handlePointerDown);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
      globalThis.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const contextValue = useMemo<KeyboardContextValue>(
    () => ({ modifiers, register, unregister }),
    [modifiers, register, unregister],
  );

  return <KeyboardContext.Provider value={contextValue}>{children}</KeyboardContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the keyboard context. Throws if used outside KeyboardProvider.
 */
function useKeyboardContext(): KeyboardContextValue {
  const context = useContext(KeyboardContext);

  if (!context) {
    throw new Error('useModifiers/useKeybinding must be used within a KeyboardProvider');
  }

  return context;
}

/**
 * Returns the current modifier key state (shift, ctrl, alt, meta).
 *
 * State is globally tracked by a single set of window-level listeners,
 * automatically resets on blur/visibility change, and syncs from pointer events.
 *
 * @example
 * ```tsx
 * const { shift } = useModifiers();
 * const label = shift ? 'Split down' : 'Split right';
 * ```
 */
export function useModifiers(): ModifierState {
  return useKeyboardContext().modifiers;
}

/**
 * Registers a keybinding and returns the formatted key combination for display.
 *
 * The callback is stored via ref -- it never causes re-registration when
 * the closure changes. Registration is effect-based and StrictMode-safe.
 *
 * @example
 * ```tsx
 * const { formattedKeyCombination } = useKeybinding(
 *   { key: 'k', modKey: true },
 *   toggleCommandPalette,
 * );
 * ```
 */
export function useKeybinding(
  keyCombination: KeyCombination,
  callback: (event: KeyboardEvent) => void,
  options?: KeybindingOptions,
): { formattedKeyCombination: string } {
  const { register, unregister } = useKeyboardContext();

  // Stable callback ref -- updated every render, read in handler
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Merge options with defaults
  const mergedOptions = useMemo<Required<KeybindingOptions>>(
    () => ({ ...defaultOptions, ...options }),
    // Serialize options to a stable string for dependency comparison
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: we serialize for stability
    [JSON.stringify(options)],
  );

  // Serialize combo for registry key and effect dependency
  const comboKey = useMemo(() => serializeCombo(keyCombination), [keyCombination]);

  // Register/unregister via effect
  useEffect(() => {
    const id = Symbol('keybinding');
    const registration: KeybindingRegistration = {
      id,
      callbackRef,
      options: mergedOptions,
    };

    register(comboKey, registration);

    return () => {
      unregister(comboKey, id);
    };
  }, [comboKey, mergedOptions, register, unregister]);

  // Format for display
  const formattedKeyCombination = useMemo(() => formatKeyCombination(keyCombination), [keyCombination]);

  return { formattedKeyCombination };
}
