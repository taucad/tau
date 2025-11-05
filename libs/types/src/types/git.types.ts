/**
 * Git Types
 *
 * Types for Git operations and version control.
 */

/**
 * Git Provider
 */
export type GitProvider = 'github' | 'bitbucket' | 'gitlab';

/**
 * Git Repository Information
 */
export type GitRepository = {
  owner: string;
  name: string;
  url: string;
  branch: string;
  isPrivate?: boolean;
};

/**
 * Git File Status
 */
export type GitFileStatus = {
  path: string;
  status: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
};

/**
 * Git Commit Information
 */
export type GitCommit = {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  timestamp: number;
};

/**
 * Git Authentication Options
 */
export type GitAuthOptions = {
  provider: GitProvider;
  accessToken: string;
  username: string;
  email: string;
};

/**
 * Git Remote Configuration
 */
export type GitRemoteConfig = {
  name: string;
  url: string;
  fetch?: string;
  push?: string;
};
