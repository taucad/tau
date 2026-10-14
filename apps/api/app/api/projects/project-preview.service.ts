/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- Nest decorators and runtime DI metadata. */
import { createHash } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { projectPreviewMaximumBytes } from '#api/projects/project-preview.dto.js';

/* oxlint-disable no-bitwise -- WebP header fields are packed bit ranges. */
/** Small, non-animated WebP; no SVG/script, full model, or unbounded decoder allocation. */
export const inspectProjectPreview = (bytes: Uint8Array<ArrayBuffer>): { width: number; height: number } => {
  const invalid = (): never => {
    throw new BadRequestException({
      code: 'PROJECT_PREVIEW_INVALID',
      message: 'Expected a WebP preview up to 768 × 576 pixels and 256 KiB.',
    });
  };
  if (bytes.length < 30 || bytes.length > projectPreviewMaximumBytes) {
    return invalid();
  }
  const buffer = Buffer.from(bytes);
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  ) {
    return invalid();
  }
  let dimensions: { width: number; height: number } | undefined;
  let hasImage = false;
  for (let offset = 12; offset < buffer.length; ) {
    if (offset + 8 > buffer.length) {
      return invalid();
    }
    const kind = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length || kind === 'ANIM' || kind === 'ANMF') {
      return invalid();
    }
    switch (kind) {
      case 'VP8X': {
        if (offset !== 12 || size !== 10 || (buffer[start]! & 2) !== 0) {
          return invalid();
        }
        dimensions = { width: buffer.readUIntLE(start + 4, 3) + 1, height: buffer.readUIntLE(start + 7, 3) + 1 };
        break;
      }
      case 'VP8 ': {
        if (size < 10 || buffer.toString('hex', start + 3, start + 6) !== '9d012a') {
          return invalid();
        }
        const image = {
          width: buffer.readUInt16LE(start + 6) & 0x3f_ff,
          height: buffer.readUInt16LE(start + 8) & 0x3f_ff,
        };
        if (dimensions && (dimensions.width !== image.width || dimensions.height !== image.height)) {
          return invalid();
        }
        dimensions = image;
        hasImage = true;
        break;
      }
      case 'VP8L': {
        if (size < 5 || buffer[start] !== 0x2f) {
          return invalid();
        }
        const bits = buffer.readUInt32LE(start + 1);
        const image = { width: (bits & 0x3f_ff) + 1, height: ((bits >>> 14) & 0x3f_ff) + 1 };
        if (dimensions && (dimensions.width !== image.width || dimensions.height !== image.height)) {
          return invalid();
        }
        dimensions = image;
        hasImage = true;
        break;
      }
      default: {
        break;
      }
    }
    if (
      dimensions &&
      (dimensions.width < 1 || dimensions.width > 768 || dimensions.height < 1 || dimensions.height > 576)
    ) {
      return invalid();
    }
    offset = start + size + (size % 2);
  }
  if (
    !hasImage ||
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.width > 768 ||
    dimensions.height < 1 ||
    dimensions.height > 576
  ) {
    return invalid();
  }
  return dimensions;
};

/* oxlint-enable no-bitwise */

@Injectable()
export class ProjectPreviewService {
  public constructor(private readonly storage: ObjectStorageService) {}

  public async put(input: {
    ownerId: string;
    projectId: string;
    image: string;
    createOnly?: boolean;
  }): Promise<{ version: string }> {
    const bytes = Buffer.from(input.image, 'base64');
    if (bytes.toString('base64') !== input.image) {
      throw new BadRequestException('Invalid preview encoding');
    }
    inspectProjectPreview(bytes);
    const version = createHash('sha256').update(bytes).digest('hex');
    const result = await this.storage.putBlob({
      namespace: 'tenants',
      key: this.key(input),
      tier: 'private',
      body: bytes,
      contentType: 'image/webp',
      cacheControl: 'private, no-store',
      ...(input.createOnly ? { ifNoneMatch: '*' } : {}),
    });
    if (result.lost) {
      throw new HttpException('A saved preview already exists', HttpStatus.PRECONDITION_FAILED);
    }
    return { version };
  }

  public async get(input: { ownerId: string; projectId: string }): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const key = this.key(input);
    const metadata = await this.storage.headBlob({ namespace: 'tenants', key, tier: 'private' });
    if (!metadata) {
      return undefined;
    }
    if (metadata.size > projectPreviewMaximumBytes) {
      throw new BadRequestException('Stored preview exceeds its size limit');
    }
    const { body } = await this.storage.getBlob({ namespace: 'tenants', key, tier: 'private' });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let length = 0;
    for await (const chunk of body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array<ArrayBuffer>);
      length += bytes.length;
      if (length > projectPreviewMaximumBytes) {
        body.destroy();
        throw new BadRequestException('Stored preview exceeds its size limit');
      }
      chunks.push(new Uint8Array(bytes));
    }
    const bytes = Buffer.concat(chunks);
    inspectProjectPreview(bytes);
    return bytes;
  }

  private key(input: { ownerId: string; projectId: string }): string {
    return `${input.ownerId}/repos/${input.projectId}/catalog-preview.webp`;
  }
}
