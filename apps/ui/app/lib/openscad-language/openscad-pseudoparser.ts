// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

export type ParsedFunctionoidDef = {
  path: string;
  name: string;
  params?: Array<{
    name: string;
    defaultValue: string;
  }>;
  signature: string;
  referencesChildren: boolean | undefined;
};
export type ParsedFunctionoidDefs = Record<string, ParsedFunctionoidDef>;

export type ParsedFile = {
  functions: ParsedFunctionoidDefs;
  modules: ParsedFunctionoidDefs;
  vars: string[];
  includes: string[];
  uses: string[];
};

export const stripComments = (src: string): string => src.replaceAll(/\/\*(.|[\s\S])*?\*\/|\/\/.*?$/gm, '');

export function parseOpenScad(path: string, src: string, skipPrivates: boolean): ParsedFile {
  const withoutComments = stripComments(src);
  const vars = [];
  const functions: ParsedFunctionoidDefs = {};
  const modules: ParsedFunctionoidDefs = {};
  const includes: string[] = [];
  const uses: string[] = [];
  for (const m of withoutComments.matchAll(/(use|include)\s*<([^>]+)>/g)) {
    (m[1] === 'use' ? uses : includes).push(m[2]);
  }

  for (const m of withoutComments.matchAll(/(?:^|[{};])\s*([$\w]+)\s*=/g)) {
    vars.push(m[1]);
  }

  for (const m of withoutComments.matchAll(
    /(function|module)\s+([$\w]+)\s*\(([^)]*)\)(?:\s*(?:=\s*)?({}|[^{}]+?;))?/gm,
  )) {
    const type = m[1];
    const name = m[2];
    if (skipPrivates && name.startsWith('_')) {
      continue;
    }

    const parametersString = m[3];
    const optBody = m[4];
    const parameters = [];
    if (/^(\s*([$\w]+(\s*=[^,()[]+)?(\s*,\s*[$\w]+(\s*=[^,()[]+)?)*)?\s*)$/m.test(parametersString)) {
      for (const parameterString of parametersString.split(',')) {
        const am = /^\s*([$\w]+)(?:\s*=([^,()[]+))?\s*$/.exec(parameterString);
        if (am) {
          const parameterName = am[1];
          const defaultValue = am[2];
          parameters.push({
            name: parameterName,
            defaultValue,
          });
        }
      }
    }

    (type === 'function' ? functions : modules)[name] = {
      path,
      name,
      signature: `${name}(${parametersString.replaceAll(/\s+/gm, ' ').replaceAll(/\b | \b/g, '')})`,
      params: parameters,
      referencesChildren: optBody === null ? undefined : optBody.includes('children()'),
    };
  }

  return { vars, functions, modules, includes, uses };
}
