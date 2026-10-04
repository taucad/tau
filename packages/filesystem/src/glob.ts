/** Match the filesystem wildcard grammar: *, ** and ?. */
export function matchesGlob(path: string, pattern: string): boolean {
  let regexString = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]!;
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        regexString += '(?:.*/)?';
        index += 2;
      } else {
        regexString += '.*';
        index++;
      }
      continue;
    }
    if (character === '*') {
      regexString += '[^/]*';
      continue;
    }
    if (character === '?') {
      regexString += '[^/]';
      continue;
    }
    regexString += String.raw`\^$.*+?()[]{}|`.includes(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${regexString}$`, 'u').test(path);
}
