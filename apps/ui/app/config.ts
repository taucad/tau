/**
 * Environment variables
 *
 * TODO: add validation
 */
export const ENV = {
  TAU_API_BASE_URL: process.env.TAU_API_URL,
  NODE_ENV: process.env.NODE_ENV,
  // Add any other environment variables you need
} as const;

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  name: 'Tau',
  githubUrl: 'https://github.com/opensrchq/tau',
  description:
    'Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.',
};
