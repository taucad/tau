import type { ActionFunction } from 'react-router';
import { destroyThemeCookie, serializeThemeCookie } from '#theme-cookie.server.js';
import { themePreferenceSchema } from '#hooks/use-theme.js';

export const action: ActionFunction = async ({ request }) => {
  const parsed = themePreferenceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ success: false, message: 'Theme is not valid.' });
  }
  const { theme } = parsed.data;

  if (theme === null) {
    return Response.json({ success: true }, { headers: { 'Set-Cookie': await destroyThemeCookie(request.url) } });
  }

  return Response.json(
    { success: true },
    { headers: { 'Set-Cookie': await serializeThemeCookie({ requestUrl: request.url, theme }) } },
  );
};
