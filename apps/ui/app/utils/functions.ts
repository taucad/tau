/**
 * Options for debounce function.
 */
interface Options {
  /**
   * Call the function on the leading edge of the timeout. Meaning immediately, instead of waiting for wait milliseconds.
   * @default false
   */
  readonly before?: boolean;
}

/**
 * Debounce a function execution.
 *
 * @see https://gist.github.com/ca0v/73a31f57b397606c9813472f7493a940?permalink_comment_id=3792845#gistcomment-3792845
 *
 * @param function_ - The function to debounce.
 * @param waitFor - The number of milliseconds to delay.
 * @param options - Options to control debounce behavior.
 * @returns A new debounced function.
 */
export const debounce = <ArgumentsType extends unknown[], U>(
  function_: (...arguments_: ArgumentsType) => PromiseLike<U> | U,
  waitFor: number,
  options: Options = {},
): ((...arguments_: ArgumentsType) => Promise<U>) => {
  let leadingValue: U | PromiseLike<U>;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let resolveList: ((value: U | PromiseLike<U>) => void)[] = [];

  return function (this: unknown, ...arguments_: ArgumentsType): Promise<U> {
    return new Promise((resolve) => {
      const shouldCallNow = options.before && !timeout;

      clearTimeout(timeout);

      timeout = setTimeout(() => {
        timeout = undefined;

        const result = options.before ? leadingValue : function_.apply(this, arguments_);

        for (const resolver of resolveList) {
          resolver(result);
        }

        resolveList = [];
      }, waitFor);

      if (shouldCallNow) {
        leadingValue = function_.apply(this, arguments_);
        resolve(leadingValue);
      } else {
        resolveList.push(resolve);
      }
    });
  };
};

/**
 * Checks if a value is a function.
 *
 * @reference Underscore.js implementation.
 * @see https://stackoverflow.com/questions/5999998/check-if-a-variable-is-of-function-type
 *
 * @param functionToCheck - The value to check.
 * @returns `true` if the value is a function, `false` otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `any` is necessary to ensure that the checked function needs no further argument checks, assuming it's already fully typed.
export function isFunction(functionToCheck: any): functionToCheck is (...arguments_: any[]) => any {
  return !!(functionToCheck && functionToCheck.constructor && functionToCheck.call && functionToCheck.apply);
}
