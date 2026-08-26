export const recentSkillsRootNamespace = ['recent_skills'] as const;
export const recentSkillsIndexKey = '__index';

export type RecentSkillValue = {
  readonly skillName: string;
  readonly resourceUri: string;
  readonly skillPath?: string;
  readonly baseDirectory?: string;
  readonly source?: string;
  readonly fingerprint?: string;
  readonly content?: string;
  readonly usedAt: string;
};
