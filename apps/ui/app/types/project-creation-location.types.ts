/** Product-level destination for a newly created project. */
export type HomeProjectCreationLocation = { readonly kind: 'home' };

/** A connected user-owned folder selected by its durable workspace identity. */
export type WorkspaceProjectCreationLocation = {
  readonly kind: 'workspace';
  readonly workspaceId: string;
};

export type ProjectCreationLocation = HomeProjectCreationLocation | WorkspaceProjectCreationLocation;

export const homeProjectCreationLocation = { kind: 'home' } as const satisfies HomeProjectCreationLocation;
