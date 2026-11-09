import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ObjectStorageService } from '@taucad/api-object-storage';
import { StorageSeeder, readStorageSeedObjects } from '@taucad/api-object-storage/seed';

/**
 * Where the default images are. The image carries them at `dist/seed/` (`vite.config.ts` copies Tau's
 * `infra/seed/` there, beside the bundle); from source, in `api:dev` and the tests, they are read from
 * `infra/seed/` itself.
 *
 * @param moduleDirectory - The directory of the running module: `dist/` in the image, this folder from source.
 * @returns The seed directory.
 */
export const storageSeedDirectory = (moduleDirectory: string = import.meta.dirname): string => {
  const bundled = join(moduleDirectory, 'seed');
  return existsSync(bundled) ? bundled : resolve(moduleDirectory, '../../../../infra/seed');
};

/**
 * Seeds the public bucket's default images and readiness probe at boot (R2 storage blast-radius blueprint D5,
 * phase 6). The API process only: the private apps import nothing from here.
 */
// oxlint-disable-next-line new-cap -- NestJS decorators are factories
@Module({
  providers: [
    {
      provide: StorageSeeder,
      inject: [ObjectStorageService],
      useFactory(storage: ObjectStorageService): StorageSeeder {
        const directory = storageSeedDirectory();
        return new StorageSeeder({ storage, objects: async () => readStorageSeedObjects(directory) });
      },
    },
  ],
})
export class StorageSeedModule {}
