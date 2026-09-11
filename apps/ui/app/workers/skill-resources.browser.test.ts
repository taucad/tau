import { systemSkillBundles } from '@taucad/skills/resources';
import { describe, expect, it } from 'vitest';

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

describe('browser skill resources', () => {
  it('should fetch every declared package resource with its generated identity', async () => {
    expect(systemSkillBundles).toHaveLength(9);

    await Promise.all(
      systemSkillBundles.flatMap((bundle) =>
        bundle.files.map(async (resource) => {
          const response = await fetch(resource.url);
          expect(response.status, `${bundle.slug}/${resource.path}`).toBe(200);
          const bytes = await response.arrayBuffer();
          expect(bytes.byteLength, `${bundle.slug}/${resource.path}`).toBe(resource.byteLength);
          expect(hex(await crypto.subtle.digest('SHA-256', bytes)), `${bundle.slug}/${resource.path}`).toBe(
            resource.sha256,
          );
        }),
      ),
    );
  });
});
