import path from 'node:path';

// Initial public package contract. Change the list and ceiling together in the causing pull request.
const PACKAGE_FILE_COUNT_CEILING = @@CREATE_REPO_package-file-count@@;

export const PACKAGE_FILES = @@CREATE_REPO_package-files-json@@.sort();

export const validatePackageFiles = (files) => {
  const normalized = files.map((file) => file.replaceAll(path.sep, '/')).sort();
  const missing = PACKAGE_FILES.filter((file) => !normalized.includes(file));
  const extra = normalized.filter((file) => !PACKAGE_FILES.includes(file));
  const forbidden = normalized.filter(
    (file) => file.endsWith('.rs') || file.endsWith('.d.ts.map') || file.includes('/target/'),
  );

  if (
    normalized.length > PACKAGE_FILE_COUNT_CEILING ||
    missing.length > 0 ||
    extra.length > 0 ||
    forbidden.length > 0
  ) {
    throw new Error(
      `npm package mismatch; count=${normalized.length}/${PACKAGE_FILE_COUNT_CEILING} ` +
        `missing=[${missing.join(', ')}] extra=[${extra.join(', ')}] forbidden=[${forbidden.join(', ')}]`,
    );
  }

  return normalized;
};
