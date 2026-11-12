/*
 * Flag parsing for `maintenance-command.ts`, kept apart so it can be tested
 * without loading the command, which runs on import.
 */

/**
 * The value after `--name`; this command takes no positional arguments anywhere.
 *
 * @param args - The arguments after the subcommand name.
 * @param name - The flag without its dashes.
 * @returns The next argument, or `undefined` when the flag is absent or last.
 */
export const optionValue = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

/**
 * The value of a flag that must be given with one.
 *
 * @param args - The arguments after the subcommand name.
 * @param name - The flag without its dashes.
 * @param usage - The help text appended to the error.
 * @returns The flag's value.
 * @throws Error - When the flag is absent, last, empty or followed by another flag.
 */
export const requiredOperand = (args: readonly string[], name: string, usage: string): string => {
  const value = optionValue(args, name);
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`--${name} is required\n\n${usage}`);
  }
  return value;
};

/**
 * A flag that may be left out but, once given, needs its value: `--project` alone is refused.
 *
 * @param args - The arguments after the subcommand name.
 * @param name - The flag without its dashes.
 * @param usage - The help text appended to the error.
 * @returns The flag's value, or `undefined` when the flag is absent.
 * @throws Error - When the flag is given without a value.
 */
export const optionalOperand = (args: readonly string[], name: string, usage: string): string | undefined =>
  args.includes(`--${name}`) ? requiredOperand(args, name, usage) : undefined;
