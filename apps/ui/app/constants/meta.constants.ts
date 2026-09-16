import { version } from 'package.json';

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  /**
   * The name of the app. Used for SEO and other metadata such as PWA and app store naming.
   */
  name: 'Tau',
  /**
   * The prefix for all database tables.
   */
  databasePrefix: 'tau-',
  /**
   * The prefix for all cookies.
   *
   * WARNING: changing this value will cause existing cookies not to be read and result in poor UX.
   */
  cookiePrefix: 'tau-',
  /**
   * The owner of the GitHub repository.
   */
  githubOwner: 'taucad',
  /**
   * The repository of the GitHub repository.
   */
  githubRepo: 'tau',
  /**
   * The URL to the GitHub repository.
   */
  githubUrl: 'https://github.com/taucad/tau',
  /**
   * The invite URL for the community Discord server.
   */
  discordUrl: 'https://discord.gg/6pfSAN3t7A',
  /**
   * The description of the app. Used for SEO and other metadata such as PWA and app store descriptions.
   */
  description:
    'Tau: the AI-native CAD platform. Describe a part, get verified, manufacturable geometry — in your browser.',
  /**
   * The version of the app.
   */
  version,
  /**
   * The user agent of the app.
   */
  userAgent: `TauCAD/${version}`,
  /**
   * The sales email address.
   */
  salesEmail: 'sales@tau.new',
  /**
   * The app domain used in marketing materials.
   */
  appDomain: 'tau.new',
} as const;

/**
 * Absolute website URL for a legal page. Product surfaces link here rather than
 * to the in-app route, which the desktop build does not ship.
 *
 * @param page - Page and optional anchor, for example `privacy#9.2.1`.
 * @returns The public website URL.
 */
export const legalUrl = (page: string): string => `https://${metaConfig.appDomain}/legal/${page}`;
