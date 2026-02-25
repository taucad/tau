import type { CompositeScreenshotOptions } from '#screenshot/types.js';

const defaultCompositeOptions = {
  enabled: true,
  preferredRatio: { columns: 3, rows: 2 },
  showLabels: true,
  padding: 12,
  labelHeight: 24,
  backgroundColor: 'transparent',
  dividerColor: '#666666',
  dividerWidth: 1,
} satisfies CompositeScreenshotOptions;

/**
 * Calculate optimal grid layout for given number of items.
 *
 * @param itemCount - Number of items to arrange in a grid.
 * @param preferredRatio - Target column-to-row ratio.
 * @param preferredRatio.columns - Preferred number of columns.
 * @param preferredRatio.rows - Preferred number of rows.
 */
export function calculateOptimalGrid(
  itemCount: number,
  preferredRatio: { columns: number; rows: number } = defaultCompositeOptions.preferredRatio,
): { columns: number; rows: number } {
  if (itemCount <= 0) {
    return { columns: 1, rows: 1 };
  }

  if (itemCount === 1) {
    return { columns: 1, rows: 1 };
  }

  const targetRatio = preferredRatio.columns / preferredRatio.rows;

  let bestColumns = 1;
  let bestRows = itemCount;
  let bestRatioDiff = Math.abs(bestColumns / bestRows - targetRatio);

  for (let columns = 1; columns <= itemCount; columns++) {
    const rows = Math.ceil(itemCount / columns);
    const ratio = columns / rows;
    const ratioDiff = Math.abs(ratio - targetRatio);

    if (ratioDiff < bestRatioDiff) {
      bestColumns = columns;
      bestRows = rows;
      bestRatioDiff = ratioDiff;
    }
  }

  return { columns: bestColumns, rows: bestRows };
}

/**
 * Create a composite grid image from multiple screenshots.
 *
 * @param screenshots - Array of labelled screenshot data URLs.
 * @param options - Composite layout options.
 * @returns A data URL of the composited image.
 */
export async function createCompositeImage(
  screenshots: Array<{ label: string; dataUrl: string }>,
  options: CompositeScreenshotOptions = defaultCompositeOptions,
): Promise<string> {
  const mergedOptions = {
    ...defaultCompositeOptions,
    ...options,
  };

  const { padding, labelHeight, showLabels, backgroundColor, dividerColor, dividerWidth, preferredRatio } =
    mergedOptions;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  const images = await Promise.all(
    screenshots.map(async (screenshot) => {
      return new Promise<{ label: string; image: HTMLImageElement }>((resolve, reject) => {
        const img = new globalThis.Image();
        img.addEventListener('load', () => {
          resolve({ label: screenshot.label, image: img });
        });
        img.addEventListener('error', reject);
        img.src = screenshot.dataUrl;
      });
    }),
  );

  if (images.length === 0) {
    throw new Error('No images to create composite image from');
  }

  const originalWidth = images[0]!.image.width;
  const originalHeight = images[0]!.image.height;

  const maxImageSize = 600;
  const scale = Math.min(1, maxImageSize / Math.max(originalWidth, originalHeight));
  const imageWidth = Math.round(originalWidth * scale);
  const imageHeight = Math.round(originalHeight * scale);

  const { columns, rows } = calculateOptimalGrid(images.length, preferredRatio);

  const effectiveLabelHeight = showLabels ? labelHeight : 0;
  const effectivePadding = Math.max(padding, Math.round(imageWidth * 0.02));

  canvas.width = columns * imageWidth + (columns + 1) * effectivePadding;
  canvas.height = rows * (imageHeight + effectiveLabelHeight) + (rows + 1) * effectivePadding;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'low';

  const isTransparent = backgroundColor === 'transparent';
  if (!isTransparent) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (showLabels) {
    const fontSize = Math.max(12, Math.round(imageHeight * 0.06));
    context.fillStyle = '#000000';
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
  }

  for (const [index, item] of images.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = effectivePadding + col * (imageWidth + effectivePadding);
    const y = effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding);

    context.drawImage(item.image, x, y, imageWidth, imageHeight);

    if (showLabels) {
      const labelX = x + imageWidth / 2;
      const labelY = y + imageHeight + effectiveLabelHeight - 5;
      context.fillText(item.label.toUpperCase(), labelX, labelY);
    }
  }

  if (dividerColor !== 'transparent') {
    context.strokeStyle = dividerColor;
    context.lineWidth = dividerWidth;

    context.beginPath();

    for (let col = 1; col < columns; col++) {
      const dividerX = effectivePadding + col * (imageWidth + effectivePadding) - effectivePadding / 2;
      context.moveTo(dividerX, effectivePadding);
      context.lineTo(dividerX, canvas.height - effectivePadding);
    }

    for (let row = 1; row < rows; row++) {
      const dividerY =
        effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding) - effectivePadding / 2;
      context.moveTo(effectivePadding, dividerY);
      context.lineTo(canvas.width - effectivePadding, dividerY);
    }

    context.stroke();
  }

  const outputFormat = 'image/webp';
  const outputQuality = 0.75;

  const blob = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob(
      (result) => {
        resolve(result ?? undefined);
      },
      outputFormat,
      outputQuality,
    );
  });

  if (!blob) {
    throw new Error('Failed to create blob from composite canvas');
  }

  const compositeDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });
    reader.addEventListener('error', reject);
    reader.readAsDataURL(blob);
  });

  return compositeDataUrl;
}
