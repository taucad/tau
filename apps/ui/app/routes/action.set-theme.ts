import type { ActionFunction } from 'react-router';
import { themeSessionResolver } from '#sessions.server.js';
import { themePreferenceSchema } from '#hooks/use-theme.js';

export const action: ActionFunction = async ({ request }) => {
  const session = await themeSessionResolver(request);
  const parsed = themePreferenceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ success: false, message: 'Theme is not valid.' });
  }
  const { theme } = parsed.data;

  if (theme === null) {
    return Response.json({ success: true }, { headers: { 'Set-Cookie': await session.destroy() } });
  }

  session.setTheme(theme);
  return Response.json({ success: true }, { headers: { 'Set-Cookie': await session.commit() } });
};
