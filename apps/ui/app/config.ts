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

export const ENV = (globalThis.window ? globalThis.window.ENV : process.env) as Environment;

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  name: 'Tau',
  githubUrl: 'https://github.com/opensrchq/tau',
  description:
    'Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.',
};
