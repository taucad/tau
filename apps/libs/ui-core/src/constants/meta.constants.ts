/**
 * The app's meta config without the fields read from its `package.json`.
 *
 * `apps/ui` spreads this into its `metaConfig` and adds `version` and
 * `userAgent`, so libraries can name storage prefixes without reading the
 * app's manifest.
 */
export const appMetaConfig = {
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
    'Tau is open-source, AI-native CAD. Describe a part, edit its parametric source, check its geometry and export it for machining or 3D printing.',
  /**
   * The sales email address.
   */
  salesEmail: 'sales@tau.new',
  /**
   * The app domain used in marketing materials.
   */
  appDomain: 'tau.new',
} as const;
