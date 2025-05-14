import { getJestProjectsAsync } from '@nx/jest';
import type { Config } from 'jest';

const config = async (): Promise<Config> => ({
  projects: await getJestProjectsAsync(),
});

export default config;
