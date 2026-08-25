import { parsePackage } from 'cdn-resolve';

type PackageInfo = {
  name: string;
  version: string;
  path: string;
};

const nodeModulesRoot = '/node_modules';

const resolveVirtualPath = (input: string): string => {
  if (input.length === 0 || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) {
    throw new TypeError(`Invalid virtual path: ${JSON.stringify(input)}`);
  }

  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.pop() === undefined) {
        throw new TypeError(`Virtual path escapes the filesystem root: ${JSON.stringify(input)}`);
      }
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
};

const invalidPackageValue = (kind: 'name' | 'subpath', value: string): never => {
  throw new TypeError(`Invalid package ${kind}: ${JSON.stringify(value)}`);
};

const validateRawPackageValue = (kind: 'name' | 'subpath', value: string): void => {
  if (value.length === 0 || value.includes('\\') || value.includes('%')) {
    invalidPackageValue(kind, value);
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))) {
      invalidPackageValue(kind, value);
    }
  }
};

const validatePackageName = (packageName: string): void => {
  validateRawPackageValue('name', packageName);
  const segments = packageName.split('/');
  const scoped = packageName.startsWith('@');
  if ((scoped && segments.length !== 2) || (!scoped && segments.length !== 1)) {
    invalidPackageValue('name', packageName);
  }
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      invalidPackageValue('name', packageName);
    }
  }
};

const validatePackageSubpath = (subpath: string): void => {
  validateRawPackageValue('subpath', subpath);
  if (subpath.startsWith('/')) {
    invalidPackageValue('subpath', subpath);
  }
  for (const segment of subpath.split('/')) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      invalidPackageValue('subpath', subpath);
    }
  }
};

export const isBareSpecifier = (specifier: string): boolean =>
  !(
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('http://') ||
    specifier.startsWith('https://')
  );

export const parsePackageSpecifier = (specifier: string): PackageInfo => {
  const parsed = parsePackage(specifier);
  const parsedPath = parsed.path ?? '';
  return {
    name: parsed.name,
    version: parsed.version === 'latest' ? '' : parsed.version,
    path: parsedPath.startsWith('/') ? parsedPath.slice(1) : parsedPath,
  };
};

export const resolveImportPath = (specifier: string, fromPath: string): string => {
  const importer = resolveVirtualPath(fromPath);
  if (specifier.startsWith('/')) {
    return resolveVirtualPath(specifier);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const lastSlash = importer.lastIndexOf('/');
    const directory = lastSlash <= 0 ? '/' : importer.slice(0, lastSlash);
    return resolveVirtualPath(`${directory === '/' ? '' : directory}/${specifier}`);
  }
  return specifier;
};

export const isNodeModulesPath = (path: string): boolean => {
  try {
    const canonical = resolveVirtualPath(path);
    return canonical === nodeModulesRoot || canonical.startsWith(`${nodeModulesRoot}/`);
  } catch {
    return false;
  }
};

export const getNodeModulesPath = (packageName: string): string => {
  validatePackageName(packageName);
  const path = resolveVirtualPath(`${nodeModulesRoot}/${packageName}`);
  if (!isNodeModulesPath(path)) {
    invalidPackageValue('name', packageName);
  }
  return path;
};

export const getCdnCachePath = (packageName: string, subpath?: string): string => {
  const basePath = getNodeModulesPath(packageName);
  if (!subpath) {
    return `${basePath}/index.js`;
  }

  validatePackageSubpath(subpath);
  return `${basePath}/${subpath}.js`;
};
