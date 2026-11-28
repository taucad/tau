import { useEffect, useMemo, useRef } from 'react';
import type { AnnotatedImage, AnnotationComment } from '@taucad/chat/annotations';
import { drawAnnotations, pinsOnImage } from '#components/comments/annotation-painter.js';

/*
 * A composer tile shows its image's pins and marks as they will be sent: drawn by the one painter (charter I5), over
 * the thumbnail and cropped the same way.
 */

/** The longest side of a tile's drawing, in canvas pixels: sharp on an 80 px tile at twice the pixel density. */
const tileDrawingSize = 320;

/**
 * The pins and marks of one composer image, over its tile.
 *
 * @param props - The annotated image and the draft's comments.
 * @returns A canvas covering the tile, cropped as the thumbnail is.
 */
export function TileMarkup({
  image,
  comments,
}: Readonly<{
  image: AnnotatedImage;
  comments: readonly AnnotationComment[];
}>): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = Math.min(1, tileDrawingSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const pins = useMemo(() => pinsOnImage(image, comments), [comments, image]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    // Drawn at the image's own size and scaled down, so pins and strokes keep the proportions of the sent image.
    context.scale(width / image.width, height / image.height);
    drawAnnotations(context, image, { marks: image.marks, pins });
  }, [height, image, pins, width]);

  return (
    <canvas
      ref={canvas}
      aria-hidden='true'
      data-testid='tile-markup'
      width={width}
      height={height}
      className='pointer-events-none absolute inset-0 size-full object-cover'
    />
  );
}
