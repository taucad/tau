import { renderImageLabelMaxLength, renderImageLabelPattern } from 'nanoraster';

const supportedCharacter = new RegExp(renderImageLabelPattern, 'u');

const sanitize = (value: string): string =>
  [...value]
    .map((character) => (supportedCharacter.test(character) ? character : '?'))
    .join('')
    .trim();

const middleElide = (value: string, maximumLength: number): string => {
  const characters = [...value];
  if (characters.length <= maximumLength) {
    return value;
  }
  if (maximumLength <= 3) {
    return '.'.repeat(maximumLength);
  }
  const retained = maximumLength - 3;
  const head = Math.ceil(retained / 2);
  return `${characters.slice(0, head).join('')}...${characters.slice(-Math.floor(retained / 2)).join('')}`;
};

/**
 * Normalize caller-owned labels to nanoraster's bounded supported repertoire.
 * @param value - Source label.
 * @param suffix - Optional view suffix preserved during middle elision.
 * @returns A supported label within nanoraster's length limit.
 * @public
 */
export const normalizeImageLabel = (value: string, suffix?: string): string => {
  const base = sanitize(value) || 'Untitled';
  const normalizedSuffix = suffix === undefined ? undefined : sanitize(suffix);
  if (!normalizedSuffix) {
    return middleElide(base, renderImageLabelMaxLength);
  }
  const separator = ' — ';
  const reservedSuffix = middleElide(normalizedSuffix, renderImageLabelMaxLength - separator.length - 1);
  const maximumBaseLength = renderImageLabelMaxLength - [...separator, ...reservedSuffix].length;
  return `${middleElide(base, maximumBaseLength)}${separator}${reservedSuffix}`;
};
