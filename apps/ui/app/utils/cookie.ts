export const setCookie = (name: string, value: string, maxAge: number): void => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`;
};

export const getCookie = (cookie: string, name: string): string | undefined => {
  const match = new RegExp('(^| )' + name + '=([^;]+)').exec(cookie);
  return match ? match[2] : undefined;
};

export const deleteCookie = (name: string): void => {
  document.cookie = `${name}=; path=/; max-age=0`;
};

export const parseCookies = (cookie: string): Record<string, string> => {
  const cookies = cookie.split('; ');
  const parsedCookies: Record<string, string> = {};
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    parsedCookies[key] = value;
  }

  return parsedCookies;
};
