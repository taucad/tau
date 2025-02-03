export const extractCookie = (cookie: string | null, key: string, defaultValue = ''): string => {
  const cookieString = cookie?.split('; ').find((item) => item.startsWith(key));
  if (!cookieString) {
    return defaultValue;
  }
  return cookieString.split('=')[1];
};
