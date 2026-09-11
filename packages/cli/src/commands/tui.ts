import { defineCommand } from 'citty';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { cliError, exitCodes } from '#output.js';

/**
 * `tau tui` — watch and drive one chat from an interactive terminal.
 *
 * The TTY refusal is decided here, before anything imports Ink or React, so a
 * pipeline that reaches for this command by mistake pays for one citty module
 * and gets a plain answer instead of an escape-sequence stream.
 *
 * @example <caption>Follow a chat on a local daemon</caption>
 * ```bash
 * export TAU_HOST_URL=http://127.0.0.1:7777
 * tau tui chat-1 --from=0
 * ```
 */
export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Watch and drive a chat in an interactive terminal UI',
  },
  args: {
    chat: { type: 'positional', description: 'Chat id', required: true },
    host: {
      type: 'string',
      description: 'Tau Host origin, such as http://127.0.0.1:7777 (defaults to TAU_HOST_URL)',
      required: false,
    },
    from: {
      type: 'string',
      description: 'Cursor to replay from; the same cursor always replays the same events',
      required: false,
    },
    agent: {
      type: 'string',
      description: 'Run every turn on an external ACP agent the host advertises, such as codex or claude',
      required: false,
    },
    model: {
      type: 'string',
      description: "Model id for --agent, such as gpt-5.3-codex-spark; absent takes the adapter's default",
      required: false,
    },
    plain: {
      type: 'boolean',
      description: 'Refuse the terminal UI and name the scripted command that replaces it',
      required: false,
    },
  },
  async run({ args }) {
    if (args.plain === true || !process.stdin.isTTY || !process.stdout.isTTY) {
      throw cliError(
        'TUI_NOT_A_TTY',
        'A terminal UI needs an interactive terminal on both stdin and stdout. Follow the same chat without one: `tau agent tail <chat> --jsonl`.',
        exitCodes.refused,
      );
    }

    const from = args.from === undefined ? 0 : Number(args.from);
    if (!Number.isInteger(from) || from < 0) {
      throw cliError(
        'CURSOR_INVALID',
        `--from takes a non-negative event cursor, not "${args.from ?? ''}".`,
        exitCodes.usage,
      );
    }

    if (args.agent === undefined && args.model !== undefined) {
      throw cliError(
        'MODEL_WITHOUT_AGENT',
        "--model selects the model of an external agent, so it needs --agent. A Tau turn runs the host's own model row.",
        exitCodes.usage,
      );
    }

    // eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
    const { runTui } = await import('#tui/app.js');
    await runTui({
      host: args.host,
      chatId: args.chat,
      from,
      ...(args.agent === undefined
        ? {}
        : { agent: { id: args.agent, ...(args.model === undefined ? {} : { model: args.model }) } }),
    });
  },
});
