import { createThemeAction } from 'remix-themes';
import { themeSessionResolver } from '#sessions.server.js';

export const action = createThemeAction(themeSessionResolver);
