/**
 * Validate the grants a browser requires before sending a private PUT.
 * @param response - Preflight response.
 * @param origin - Exact requesting origin.
 * @param headers - Non-safelisted headers sent by the transfer.
 * @returns Whether all explicit grants are present.
 */
export const permitsPrivatePut = (response: Response, origin: string, headers: readonly string[]): boolean => {
  const allowed = (name: string) =>
    new Set(
      (response.headers.get(name) ?? '')
        .toLowerCase()
        .split(',')
        .map((value) => value.trim()),
    );
  const methods = allowed('access-control-allow-methods');
  const grantedHeaders = allowed('access-control-allow-headers');
  return (
    response.ok &&
    response.headers.get('access-control-allow-origin') === origin &&
    methods.has('put') &&
    headers.every((name) => grantedHeaders.has(name.toLowerCase()))
  );
};
