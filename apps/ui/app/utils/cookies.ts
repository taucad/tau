export const extractCookie = (cookie: string | null, key: string): string => {
  const cookieString = cookie?.split('; ').find((item) => item.startsWith(key));
  if (!cookieString) {
    return '';
  }
  return cookieString.split('=')[1];
};
