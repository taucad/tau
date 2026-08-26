/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
/* oxlint-disable new-cap -- decorators are not constructors */
import { BadRequestException, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { publicationApiCode } from '@taucad/types/constants';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { maxTotalBytes } from '#api/publications/publications.service.js';

export type MultipartIteratorPart =
  | {
      type: 'field';
      fieldname: string;
      value: string;
    }
  | {
      type: 'file';
      fieldname: string;
      file: AsyncIterable<Uint8Array<ArrayBuffer>>;
      filename: string;
      encoding: string;
      mimetype: string;
    };

export type MultipartRequest = FastifyRequest & {
  parts: () => AsyncIterable<MultipartIteratorPart>;
};

export type PublishMultipartRaw = {
  manifest?: string;
  files: Map<string, Uint8Array<ArrayBuffer>>;
};

export async function collectFileIterable(
  iterable: AsyncIterable<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of iterable) {
    chunks.push(new Uint8Array(chunk));
  }

  return concatUint8Arrays(chunks);
}

export async function collectPublishMultipart(
  request: MultipartRequest,
  totalByteLimit: number = maxTotalBytes,
): Promise<PublishMultipartRaw> {
  let manifest: string | undefined;
  let totalBytes = 0;
  const files = new Map<string, Uint8Array<ArrayBuffer>>();

  for await (const part of request.parts()) {
    if (part.type === 'field' && part.fieldname === 'manifest') {
      manifest = typeof part.value === 'string' ? part.value : String(part.value);
      continue;
    }

    if (part.type === 'file') {
      const relativePath = part.fieldname.replaceAll('\\', '/').replace(/^\.\/+/, '');
      const collected = await collectFileIterable(part.file);
      totalBytes += collected.byteLength;
      // Fail fast once the running total trips the cap so we stop pulling (and buffering) further parts.
      if (totalBytes > totalByteLimit) {
        throw new BadRequestException({
          code: publicationApiCode.PAYLOAD_TOO_LARGE,
          message: 'Total upload exceeds limit',
        });
      }
      files.set(relativePath, collected);
    }
  }

  return { manifest, files };
}

export const PublishMultipart = createParamDecorator(
  async (_data: unknown, context: ExecutionContext): Promise<PublishMultipartRaw> => {
    const request = context.switchToHttp().getRequest<MultipartRequest>();
    return collectPublishMultipart(request);
  },
);
