/**
 * Synchronous partial-JSON repair: the value a streaming tool input holds so far.
 *
 * A tool row shows its input while the model streams it, so each `tool-input-delta` reparses the text received so
 * far. This is a synchronous port of the pinned AI SDK's own repair, so the transcript fold needs no promise per
 * delta and reads the same value the SDK read (use_skill startup latency blueprint, T1).
 *
 * `fixJson` and `parsePartialJson` are derived from `ai` 6.0.304 (`src/util/fix-json.ts`,
 * `src/util/parse-partial-json.ts`):
 *
 * Copyright 2023 Vercel, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * `secureJsonParse` is derived from `@ai-sdk/provider-utils` 4.0.57 (`src/secure-json-parse.ts`), itself adapted from
 * https://github.com/fastify/secure-json-parse, under the BSD-3-Clause licence of that file:
 *
 * Copyright (c) Vercel, Inc. (https://vercel.com)
 * Copyright (c) 2019 The Fastify Team
 * Copyright (c) 2019, Sideway Inc, and project contributors
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
 * following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
 * disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
 * following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote
 * products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

type State =
  | 'ROOT'
  | 'FINISH'
  | 'INSIDE_STRING'
  | 'INSIDE_STRING_ESCAPE'
  | 'INSIDE_STRING_UNICODE_ESCAPE'
  | 'INSIDE_LITERAL'
  | 'INSIDE_NUMBER'
  | 'INSIDE_OBJECT_START'
  | 'INSIDE_OBJECT_KEY'
  | 'INSIDE_OBJECT_AFTER_KEY'
  | 'INSIDE_OBJECT_BEFORE_VALUE'
  | 'INSIDE_OBJECT_AFTER_VALUE'
  | 'INSIDE_OBJECT_AFTER_COMMA'
  | 'INSIDE_ARRAY_START'
  | 'INSIDE_ARRAY_AFTER_VALUE'
  | 'INSIDE_ARRAY_AFTER_COMMA';

const isHexDigit = (char: string): boolean =>
  (char >= '0' && char <= '9') || (char >= 'A' && char <= 'F') || (char >= 'a' && char <= 'f');

const isDigit = (char: string): boolean => char >= '0' && char <= '9';

const literals = ['true', 'false', 'null'] as const;

/**
 * Close a JSON prefix so a standard parser accepts it: one linear scan that cuts an unfinished token and appends the
 * closers its open strings, objects and arrays need. Invalid JSON is not repaired; the parse that follows rejects it.
 *
 * @param input - A prefix of a JSON text.
 * @returns The repaired text.
 * @internal
 */
// oxlint-disable-next-line complexity, max-statements, max-lines-per-function -- One state machine, kept as the SDK wrote it so the port stays comparable.
export const fixJson = (input: string): string => {
  const stack: State[] = ['ROOT'];
  let lastValidIndex = -1;
  let literalStart = 0;
  let unicodeEscapeDigits = 0;

  const swap = (next: State, push: State): void => {
    stack.pop();
    stack.push(next, push);
  };

  const processValueStart = (char: string, index: number, swapState: State): void => {
    switch (char) {
      case '"': {
        lastValidIndex = index;
        swap(swapState, 'INSIDE_STRING');
        break;
      }
      case 'f':
      case 't':
      case 'n': {
        lastValidIndex = index;
        literalStart = index;
        swap(swapState, 'INSIDE_LITERAL');
        break;
      }
      case '-': {
        swap(swapState, 'INSIDE_NUMBER');
        break;
      }
      case '{': {
        lastValidIndex = index;
        swap(swapState, 'INSIDE_OBJECT_START');
        break;
      }
      case '[': {
        lastValidIndex = index;
        swap(swapState, 'INSIDE_ARRAY_START');
        break;
      }
      default: {
        if (isDigit(char)) {
          lastValidIndex = index;
          swap(swapState, 'INSIDE_NUMBER');
        }
      }
    }
  };

  const processAfterObjectValue = (char: string, index: number): void => {
    if (char === ',') {
      stack.pop();
      stack.push('INSIDE_OBJECT_AFTER_COMMA');
    } else if (char === '}') {
      lastValidIndex = index;
      stack.pop();
    }
  };

  const processAfterArrayValue = (char: string, index: number): void => {
    if (char === ',') {
      stack.pop();
      stack.push('INSIDE_ARRAY_AFTER_COMMA');
    } else if (char === ']') {
      lastValidIndex = index;
      stack.pop();
    }
  };

  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    switch (stack.at(-1)) {
      case 'ROOT': {
        processValueStart(char, index, 'FINISH');
        break;
      }
      case 'INSIDE_OBJECT_START': {
        if (char === '"') {
          stack.pop();
          stack.push('INSIDE_OBJECT_KEY');
        } else if (char === '}') {
          lastValidIndex = index;
          stack.pop();
        }
        break;
      }
      case 'INSIDE_OBJECT_AFTER_COMMA': {
        if (char === '"') {
          stack.pop();
          stack.push('INSIDE_OBJECT_KEY');
        }
        break;
      }
      case 'INSIDE_OBJECT_KEY': {
        if (char === '"') {
          stack.pop();
          stack.push('INSIDE_OBJECT_AFTER_KEY');
        }
        break;
      }
      case 'INSIDE_OBJECT_AFTER_KEY': {
        if (char === ':') {
          stack.pop();
          stack.push('INSIDE_OBJECT_BEFORE_VALUE');
        }
        break;
      }
      case 'INSIDE_OBJECT_BEFORE_VALUE': {
        processValueStart(char, index, 'INSIDE_OBJECT_AFTER_VALUE');
        break;
      }
      case 'INSIDE_OBJECT_AFTER_VALUE': {
        processAfterObjectValue(char, index);
        break;
      }
      case 'INSIDE_STRING': {
        if (char === '"') {
          stack.pop();
          lastValidIndex = index;
        } else if (char === '\\') {
          stack.push('INSIDE_STRING_ESCAPE');
        } else {
          lastValidIndex = index;
        }
        break;
      }
      case 'INSIDE_ARRAY_START': {
        if (char === ']') {
          lastValidIndex = index;
          stack.pop();
        } else {
          lastValidIndex = index;
          processValueStart(char, index, 'INSIDE_ARRAY_AFTER_VALUE');
        }
        break;
      }
      case 'INSIDE_ARRAY_AFTER_VALUE': {
        if (char === ',') {
          stack.pop();
          stack.push('INSIDE_ARRAY_AFTER_COMMA');
        } else if (char === ']') {
          lastValidIndex = index;
          stack.pop();
        } else {
          lastValidIndex = index;
        }
        break;
      }
      case 'INSIDE_ARRAY_AFTER_COMMA': {
        processValueStart(char, index, 'INSIDE_ARRAY_AFTER_VALUE');
        break;
      }
      case 'INSIDE_STRING_ESCAPE': {
        stack.pop();
        if (char === 'u') {
          unicodeEscapeDigits = 0;
          stack.push('INSIDE_STRING_UNICODE_ESCAPE');
        } else {
          lastValidIndex = index;
        }
        break;
      }
      case 'INSIDE_STRING_UNICODE_ESCAPE': {
        if (isHexDigit(char)) {
          unicodeEscapeDigits++;
          if (unicodeEscapeDigits === 4) {
            stack.pop();
            lastValidIndex = index;
          }
        }
        break;
      }
      case 'INSIDE_NUMBER': {
        switch (char) {
          case 'e':
          case 'E':
          case '-':
          case '.': {
            // Part of the number; it is valid only once a digit follows.
            break;
          }
          case ',': {
            stack.pop();
            if (stack.at(-1) === 'INSIDE_ARRAY_AFTER_VALUE') {
              processAfterArrayValue(char, index);
            }
            if (stack.at(-1) === 'INSIDE_OBJECT_AFTER_VALUE') {
              processAfterObjectValue(char, index);
            }
            break;
          }
          case '}': {
            stack.pop();
            if (stack.at(-1) === 'INSIDE_OBJECT_AFTER_VALUE') {
              processAfterObjectValue(char, index);
            }
            break;
          }
          case ']': {
            stack.pop();
            if (stack.at(-1) === 'INSIDE_ARRAY_AFTER_VALUE') {
              processAfterArrayValue(char, index);
            }
            break;
          }
          default: {
            if (isDigit(char)) {
              lastValidIndex = index;
            } else {
              stack.pop();
            }
          }
        }
        break;
      }
      case 'INSIDE_LITERAL': {
        const partialLiteral = input.slice(literalStart, index + 1);
        if (literals.some((literal) => literal.startsWith(partialLiteral))) {
          lastValidIndex = index;
        } else {
          stack.pop();
          if (stack.at(-1) === 'INSIDE_OBJECT_AFTER_VALUE') {
            processAfterObjectValue(char, index);
          } else if (stack.at(-1) === 'INSIDE_ARRAY_AFTER_VALUE') {
            processAfterArrayValue(char, index);
          }
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  let result = input.slice(0, lastValidIndex + 1);
  for (let index = stack.length - 1; index >= 0; index--) {
    switch (stack[index]) {
      case 'INSIDE_STRING': {
        result += '"';
        break;
      }
      case 'INSIDE_OBJECT_KEY':
      case 'INSIDE_OBJECT_AFTER_KEY':
      case 'INSIDE_OBJECT_AFTER_COMMA':
      case 'INSIDE_OBJECT_START':
      case 'INSIDE_OBJECT_BEFORE_VALUE':
      case 'INSIDE_OBJECT_AFTER_VALUE': {
        result += '}';
        break;
      }
      case 'INSIDE_ARRAY_START':
      case 'INSIDE_ARRAY_AFTER_COMMA':
      case 'INSIDE_ARRAY_AFTER_VALUE': {
        result += ']';
        break;
      }
      case 'INSIDE_LITERAL': {
        const partialLiteral = input.slice(literalStart);
        const literal = literals.find((candidate) => candidate.startsWith(partialLiteral));
        if (literal !== undefined) {
          result += literal.slice(partialLiteral.length);
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  return result;
};

const suspectProtoRx =
  /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/u;
const suspectConstructorRx =
  /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/u;

type JsonNode = Readonly<Record<string, unknown>>;

const isNode = (value: unknown): value is JsonNode => typeof value === 'object' && value !== null;

/** Reject a parsed object that carries a prototype-polluting key, as the SDK's secure parse does. */
const assertNoForbiddenKeys = (value: JsonNode): void => {
  let next: JsonNode[] = [value];
  while (next.length > 0) {
    const nodes = next;
    next = [];
    for (const node of nodes) {
      if (Object.hasOwn(node, '__proto__')) {
        throw new SyntaxError('Object contains forbidden prototype property');
      }
      const constructor = Object.hasOwn(node, 'constructor') ? node.constructor : undefined;
      if (isNode(constructor) && Object.hasOwn(constructor, 'prototype')) {
        throw new SyntaxError('Object contains forbidden prototype property');
      }
      for (const child of Object.values(node)) {
        if (isNode(child)) {
          next.push(child);
        }
      }
    }
  }
};

/** `JSON.parse`, refusing `__proto__` and `constructor.prototype` keys; it throws as `JSON.parse` does. */
const secureJsonParse = (text: string): unknown => {
  const value: unknown = JSON.parse(text);
  if (isNode(value) && (suspectProtoRx.test(text) || suspectConstructorRx.test(text))) {
    assertNoForbiddenKeys(value);
  }
  return value;
};

const tryParse = (text: string): Readonly<{ value: unknown }> | undefined => {
  try {
    return { value: secureJsonParse(text) };
  } catch {
    return undefined;
  }
};

/**
 * The value a JSON prefix holds so far: the text parsed as is, else repaired with {@link fixJson}, else `undefined`.
 *
 * @param text - The text received so far, or `undefined`.
 * @returns The parsed value, or `undefined` when neither parse succeeds.
 * @public
 */
export const parsePartialJson = (text: string | undefined): unknown => {
  if (text === undefined) {
    return undefined;
  }
  return (tryParse(text) ?? tryParse(fixJson(text)))?.value;
};
