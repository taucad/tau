/**
 * Environment variable loader for the server.
 *
 * TODO: add validation
 */
export const getEnvironment = () => {
  return {
    TAU_API_URL: process.env.TAU_API_URL,
    NODE_ENV: process.env.NODE_ENV,
    // Add any other environment variables you need
  } as const;
};

type Environment = ReturnType<typeof getEnvironment>;

// Extend the global Window interface
declare global {
  interface Window {
    ENV: Environment;
  }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The env is always injected via root.tsx
export const ENV = (globalThis.window ? globalThis.window.ENV : process.env) as Environment;

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  /**
   * The name of the app. Used for SEO and other metadata such as PWA and app store naming.
   */
  name: 'Tau',
  /**
   * The prefix for all cookies.
   *
   * WARNING: changing this value will cause existing cookies not to be read and result in poor UX.
   */
  cookiePrefix: 'tau-',
  /**
   * The URL to the GitHub repository.
   */
  githubUrl: 'https://github.com/opensrchq/tau',
  /**
   * The description of the app. Used for SEO and other metadata such as PWA and app store descriptions.
   */
  description:
    'Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.',
} as const;
