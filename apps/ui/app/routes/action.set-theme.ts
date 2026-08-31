import type { ActionFunction } from 'react-router';
import { themeSessionResolver } from '#sessions.server.js';
import { isTheme } from '#hooks/use-theme.js';

export const action: ActionFunction = async ({ request }) => {
  const session = await themeSessionResolver(request);
  const { theme } = (await request.json()) as { theme?: unknown };

  if (theme === null) {
    return Response.json({ success: true }, { headers: { 'Set-Cookie': await session.destroy() } });
  }

  if (!isTheme(theme)) {
    return Response.json({ success: false, message: 'Theme is not valid.' });
  }

  session.setTheme(theme);
  return Response.json({ success: true }, { headers: { 'Set-Cookie': await session.commit() } });
};
