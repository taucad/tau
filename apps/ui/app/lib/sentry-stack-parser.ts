import { defaultStackParser } from '@sentry/react';
import type { StackFrame } from '@sentry/react';

/*
 * The SDK's stack parser, alone: the event sent without the SDK (`#lib/sentry-event.lib`) parses its frames with it.
 * It loads on the first error a page reports, so the error-reporting code on every page's interactive tier carries
 * no part of `@sentry/react` (progressive loading PL5).
 */

/**
 * Parse a stack into Sentry's frames with the SDK's default parser.
 *
 * @param stack - An error's `stack` string.
 * @returns The frames, oldest first.
 */
export const parseSentryStack = (stack: string): StackFrame[] => defaultStackParser(stack);
