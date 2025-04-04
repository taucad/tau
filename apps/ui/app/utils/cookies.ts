/* eslint-disable unicorn/no-document-cookie -- this is the only allowable entry point for cookie management */
export const setCookie = (name: string, value: string, maxAge: number) => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`;
};

export const getCookie = (cookie: string, name: string): string | undefined => {
  const match = cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : undefined;
};

export const deleteCookie = (name: string) => {
  document.cookie = `${name}=; path=/; max-age=0`;
};

export const parseCookies = (cookie: string) => {
  const cookies = cookie.split('; ');
  const parsedCookies: Record<string, string> = {};
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    parsedCookies[key] = value;
  }
  return parsedCookies;
};

/* eslint-enable unicorn/no-document-cookie -- renabling */
