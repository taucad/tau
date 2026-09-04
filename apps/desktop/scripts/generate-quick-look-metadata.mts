#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention -- Apple plist keys use platform-defined casing. */

/**
 * Purpose: Generate macOS Quick Look and Launch Services metadata from one format manifest.
 * Why: Finder extensions, the Electron host, and the converter graph must not drift apart.
 * Environment: Node.js with @oxc-node/core/register from the Tau workspace.
 * Usage: node --import @oxc-node/core/register scripts/generate-quick-look-metadata.mts [--check|--write]
 * Exit codes: 0 when generated files match; 1 for invalid input, drift, or write failures.
 */

import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { converterImportFormats } from '@taucad/converter';

type Format = {
  readonly extensions: readonly string[];
  readonly identifier: string;
  readonly declaration: 'exported' | 'imported';
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly mimeTypes: readonly string[];
  readonly sidecars: boolean;
  readonly systemPreview: boolean;
  readonly utiOwner: string;
  readonly utiSource: string;
  readonly fixture: {
    readonly entry: string;
    readonly files: readonly string[];
    readonly expectedGeometry: {
      readonly bounds: 'finite-nonzero';
      readonly minimumTriangles: number;
    };
  };
};

type Manifest = {
  readonly schemaVersion: 1;
  readonly bundleIdentifier: string;
  readonly previewInterchange: 'usdz';
  readonly directElectronPreviewExtensions: readonly string[];
  readonly limits: {
    readonly maxSourceBytes: number;
    readonly maxSidecarBytes: number;
    readonly maxTotalBytes: number;
    readonly maxFiles: number;
    readonly maxDepth: number;
    readonly maxOutputBytes: number;
    readonly timeoutMilliseconds: number;
  };
  readonly formats: readonly Format[];
};

type UntrustedFormat = Partial<Omit<Format, 'fixture'>> & {
  readonly fixture?: Partial<Omit<Format['fixture'], 'expectedGeometry'>> & {
    readonly expectedGeometry?: Partial<Format['fixture']['expectedGeometry']>;
  };
};

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const manifestPath = resolve(desktopRoot, 'macos/quick-look-formats.json');
const generatedRoot = resolve(desktopRoot, 'macos/generated');

const xml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const plistValue = (value: unknown, indent = '  '): string => {
  if (typeof value === 'string') {
    return `${indent}<string>${xml(value)}</string>`;
  }
  if (typeof value === 'boolean') {
    return `${indent}<${value ? 'true' : 'false'}/>`;
  }
  if (typeof value === 'number') {
    return `${indent}<integer>${value}</integer>`;
  }
  if (Array.isArray(value)) {
    return `${indent}<array>\n${value.map((item) => plistValue(item, `${indent}  `)).join('\n')}\n${indent}</array>`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return `${indent}<dict>\n${entries
      .map(([key, item]) => `${indent}  <key>${xml(key)}</key>\n${plistValue(item, `${indent}  `)}`)
      .join('\n')}\n${indent}</dict>`;
  }
  throw new TypeError(`Cannot serialize plist value: ${String(value)}`);
};

const plist = (value: Record<string, unknown>): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plistValue(value, '')}\n</plist>\n`;

const requireStringArray = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string array`);
  }
  return value.map((item: unknown) => {
    if (typeof item !== 'string' || !item) {
      throw new TypeError(`${label} must contain only non-empty strings`);
    }
    return item;
  });
};

const parseManifest = (source: string): Manifest => {
  const value = JSON.parse(source) as unknown as Partial<Manifest>;
  if (value.schemaVersion !== 1 || value.previewInterchange !== 'usdz' || !value.bundleIdentifier) {
    throw new TypeError('Unsupported Quick Look manifest header');
  }
  if (!value.limits || !value.formats?.length) {
    throw new TypeError('Quick Look manifest is missing limits or formats');
  }
  const directElectronPreviewExtensions = requireStringArray(
    value.directElectronPreviewExtensions,
    'directElectronPreviewExtensions',
  );
  for (const [name, limit] of Object.entries(value.limits)) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError(`limits.${name} must be a positive integer`);
    }
  }
  const extensions = new Set<string>();
  const identifiers = new Set<string>();
  for (const [index, format] of (value.formats as readonly UntrustedFormat[]).entries()) {
    const formatExtensions = requireStringArray(format.extensions, `formats[${index}].extensions`);
    requireStringArray(format.mimeTypes, `formats[${index}].mimeTypes`);
    if (
      !format.identifier ||
      !format.description ||
      !format.utiOwner ||
      !format.utiSource ||
      !format.declaration ||
      !['exported', 'imported'].includes(format.declaration)
    ) {
      throw new TypeError(`formats[${index}] has invalid metadata`);
    }
    const { fixture } = format;
    const fixtureFiles = requireStringArray(fixture?.files, `formats[${index}].fixture.files`);
    if (
      !fixture?.entry ||
      !fixtureFiles.includes(fixture.entry) ||
      !formatExtensions.some((extension) => fixture.entry?.toLowerCase().endsWith(`.${extension}`)) ||
      !Number.isSafeInteger(fixture.expectedGeometry?.minimumTriangles) ||
      (fixture.expectedGeometry?.minimumTriangles ?? -1) < 0 ||
      fixture.expectedGeometry?.bounds !== 'finite-nonzero'
    ) {
      throw new TypeError(`formats[${index}] has invalid fixture evidence`);
    }
    if (format.declaration === 'exported' && format.utiOwner !== 'TAUCAD LIMITED') {
      throw new TypeError(`formats[${index}] exports a UTI not owned by Tau`);
    }
    for (const fixturePath of fixtureFiles) {
      if (!existsSync(resolve(workspaceRoot, fixturePath))) {
        throw new TypeError(`formats[${index}] fixture does not exist: ${fixturePath}`);
      }
    }
    if (identifiers.has(format.identifier)) {
      throw new TypeError(`Duplicate UTI ${format.identifier}`);
    }
    identifiers.add(format.identifier);
    for (const extension of formatExtensions) {
      if (extensions.has(extension)) {
        throw new TypeError(`Duplicate extension ${extension}`);
      }
      extensions.add(extension);
    }
  }
  for (const extension of directElectronPreviewExtensions) {
    const format = value.formats.find((candidate) => candidate.extensions.includes(extension));
    if (!format?.systemPreview) {
      throw new TypeError(`Direct Electron preview extension is not delegated to macOS: ${extension}`);
    }
  }
  return value as Manifest;
};

const typeDeclaration = (format: Format): Record<string, unknown> => ({
  UTTypeIdentifier: format.identifier,
  UTTypeDescription: format.description,
  UTTypeConformsTo: ['public.data'],
  UTTypeTagSpecification: {
    'public.filename-extension': [...format.extensions],
    'public.mime-type': [...format.mimeTypes],
  },
});

const supportedIdentifiers = (manifest: Manifest): readonly string[] =>
  manifest.formats
    .filter((format) => !format.systemPreview)
    .flatMap((format) => [format.identifier, ...(format.aliases ?? [])]);

const extensionInfo = (options: { manifest: Manifest; point: string; principal: string }): string =>
  plist({
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleDisplayName: 'Tau',
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: '$(PRODUCT_NAME)',
    CFBundlePackageType: 'XPC!',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    LSMinimumSystemVersion: '$(MACOSX_DEPLOYMENT_TARGET)',
    NSExtension: {
      NSExtensionAttributes: {
        QLSupportedContentTypes: [...supportedIdentifiers(options.manifest)],
        ...(options.point === 'com.apple.quicklook.thumbnail' ? { QLThumbnailMinimumDimension: 20 } : {}),
      },
      NSExtensionPointIdentifier: options.point,
      NSExtensionPrincipalClass: `$(PRODUCT_MODULE_NAME).${options.principal}`,
    },
  });

const hostInfo = (manifest: Manifest): string =>
  plist({
    CFBundleDocumentTypes: manifest.formats.map((format) => ({
      CFBundleTypeName: format.description,
      CFBundleTypeRole: 'Viewer',
      LSHandlerRank: 'Alternate',
      LSItemContentTypes: [format.identifier, ...(format.aliases ?? [])],
    })),
    UTExportedTypeDeclarations: manifest.formats
      .filter((format) => format.declaration === 'exported')
      .map((format) => typeDeclaration(format)),
    UTImportedTypeDeclarations: manifest.formats
      .filter((format) => format.declaration === 'imported')
      .map((format) => typeDeclaration(format)),
  });

const swiftString = (value: string): string => JSON.stringify(value);

const swiftManifest = (manifest: Manifest): string => {
  const formats = manifest.formats
    .map(
      (format) =>
        `    Format(extensions: [${format.extensions.map((extension) => swiftString(extension)).join(', ')}], identifiers: [${[
          format.identifier,
          ...(format.aliases ?? []),
        ]
          .map((identifier) => swiftString(identifier))
          .join(', ')}], includesSidecars: ${format.sidecars})`,
    )
    .join(',\n');
  return `// Generated by scripts/generate-quick-look-metadata.mts. Do not edit.\nimport Foundation\n\nenum TauQuickLookManifest {\n  struct Format: Sendable {\n    let extensions: [String]\n    let identifiers: [String]\n    let includesSidecars: Bool\n  }\n\n  static let maxSourceBytes = ${manifest.limits.maxSourceBytes}\n  static let maxSidecarBytes = ${manifest.limits.maxSidecarBytes}\n  static let maxTotalBytes = ${manifest.limits.maxTotalBytes}\n  static let maxFiles = ${manifest.limits.maxFiles}\n  static let maxDepth = ${manifest.limits.maxDepth}\n  static let maxOutputBytes = ${manifest.limits.maxOutputBytes}\n  static let timeoutMilliseconds = ${manifest.limits.timeoutMilliseconds}\n  static let formats: [Format] = [\n${formats}\n  ]\n}\n`;
};

const expectedOutputs = (manifest: Manifest): Readonly<Record<string, string>> => ({
  'TauQuickLookPreview-Info.plist': extensionInfo({
    manifest,
    point: 'com.apple.quicklook.preview',
    principal: 'PreviewViewController',
  }),
  'TauQuickLookThumbnail-Info.plist': extensionInfo({
    manifest,
    point: 'com.apple.quicklook.thumbnail',
    principal: 'ThumbnailProvider',
  }),
  'TauHost-Info.plist': hostInfo(manifest),
  'FormatManifest.generated.swift': swiftManifest(manifest),
});

const validateConverterGraph = async (manifest: Manifest): Promise<void> => {
  const declared = manifest.formats.flatMap((format) => format.extensions).sort();
  const actual = [...converterImportFormats].sort();
  if (JSON.stringify(declared) !== JSON.stringify(actual)) {
    throw new Error(
      `Quick Look formats drifted from converter imports:\nmanifest=${declared.join(',')}\nconverter=${actual.join(',')}`,
    );
  }
};

const main = async (): Promise<void> => {
  const modes = process.argv.slice(2);
  if (modes.length > 1 || (modes[0] && !['--check', '--write'].includes(modes[0]))) {
    throw new TypeError('Usage: generate-quick-look-metadata.mts [--check|--write]');
  }
  const manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  await validateConverterGraph(manifest);
  const outputs = expectedOutputs(manifest);
  if (modes[0] === '--write') {
    await mkdir(generatedRoot, { recursive: true });
    await Promise.all(
      Object.entries(outputs).map(async ([name, contents]) => {
        await writeFile(resolve(generatedRoot, name), contents, 'utf8');
      }),
    );
    return;
  }
  const compared = await Promise.all(
    Object.entries(outputs).map(async ([name, expected]) => {
      const path = resolve(generatedRoot, name);
      const actual = await readFile(path, 'utf8').catch(() => undefined);
      return actual === expected ? undefined : name;
    }),
  );
  const drift = compared.filter((name): name is string => name !== undefined);
  if (drift.length > 0) {
    throw new Error(`Generated Quick Look metadata is stale: ${drift.join(', ')}. Run with --write.`);
  }
};

await main();
