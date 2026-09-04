import { copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';

export const populateEnv = async (examplePath: string, envPath: string): Promise<void> => {
  await copyFile(examplePath, envPath, constants.COPYFILE_EXCL).catch((error: unknown) => {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
      throw error;
    }
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await populateEnv(process.argv[2]!, process.argv[3]!);
}
