import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { PDFParse } from 'pdf-parse';

const maximumOutputBytes = 20 * 1024 * 1024;
const maximumPages = 10_000;

type TextResult = {
  text: string;
  total?: number;
};

const main = async (): Promise<void> => {
  const [path, extra] = process.argv.slice(2);
  if (!path || extra) {
    throw new Error('usage: pdf-to-md.extract.ts <pdf-path>');
  }

  const parser = new PDFParse({ data: readFileSync(path) });
  try {
    const result = (await parser.getText()) as TextResult;
    if (result.total !== undefined && (!Number.isSafeInteger(result.total) || result.total > maximumPages)) {
      throw new Error(`PDF page count exceeds ${maximumPages}`);
    }
    const meaningfulText = result.text.replaceAll(/^\s*-- \d+ of \d+ --\s*$/gmu, '').trim();
    if (meaningfulText === '') {
      throw new Error('no extractable text found; the PDF may be scanned or image-only and may require OCR');
    }
    const output = JSON.stringify({ text: result.text, pages: result.total });
    if (Buffer.byteLength(output) > maximumOutputBytes) {
      throw new Error(`PDF extracted text exceeds ${maximumOutputBytes} bytes`);
    }
    process.stdout.write(output);
  } finally {
    await parser.destroy();
  }
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
