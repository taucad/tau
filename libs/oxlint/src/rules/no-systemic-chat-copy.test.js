import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noSystemicChatCopyRule } from './no-systemic-chat-copy.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const violation = (phrase) => [{ messageId: 'violation', data: { phrase } }];

describe('no-systemic-chat-copy', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-systemic-chat-copy', noSystemicChatCopyRule, {
      valid: [
        { name: 'a residual line', code: "const title = 'The latest turns are on Studio Mac.';" },
        { name: 'Git host is the product phrase', code: "const title = 'Your Git host asked for a sign-in';" },
        { name: 'a category identifier', code: "if (category === 'updateHost' || code === 'HOST_FAULT') {}" },
        { name: 'a camel-case category', code: "const card = { category: 'hostFault' };" },
        { name: 'an object key', code: "const billing = { host: 'platform.openai.com' };" },
        {
          name: 'an import path',
          code: "import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';",
        },
        { name: 'file attachments', code: "const label = 'Attached files';" },
        { name: 'a file that could not attach is not a chat failure', code: "const ok = 'Add the file again';" },
        { name: 'a lost connection to a model', code: "const title = 'Connection lost';" },
        {
          name: 'JSX copy without the words',
          code: 'const card = <p>Pair <strong>Studio Mac</strong> to keep working with it.</p>;',
        },
        { name: 'a comment is not copy', code: '/* the host went silent */ const ok = 1;' },
        { name: 'a TS literal type', code: "type Owner = 'host' | 'log';" },
      ],
      invalid: [
        {
          name: 'U21 heading',
          code: "const title = 'Tau stopped responding';",
          errors: violation('stopped responding'),
        },
        {
          name: 'U21 reason',
          code: "const reason = 'Tau cannot tell whether this turn started.';",
          errors: violation('cannot tell whether'),
        },
        {
          name: 'U8 sentence',
          code: "throw new Error('This message may already have been sent on another host.');",
          errors: violation('host'),
        },
        {
          name: 'host in JSX text',
          code: 'const card = <p>The agent host could not be reached.</p>;',
          errors: violation('host'),
        },
        {
          name: 'host attachment failed',
          code: "const title = 'Host attachment failed';",
          errors: violation('Host'),
        },
        {
          name: 'could not attach',
          code: "const title = 'Tau could not attach to this chat';",
          errors: violation('could not attach'),
        },
        {
          name: 'connection failed',
          code: "const title = 'The connection failed';",
          errors: violation('connection failed'),
        },
        {
          name: 'a template literal',
          code: `const title = \`Reconnect \${name} to its host\`;`,
          errors: violation('host'),
        },
        { name: 'a JSX attribute', code: "const card = <Card title='Lost the host' />;", errors: violation('host') },
      ],
    });
  });
});
