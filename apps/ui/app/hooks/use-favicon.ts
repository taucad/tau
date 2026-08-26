import { useCallback, useEffect } from 'react';
import { stringToBase64 } from 'uint8array-extras';
import { tauLogoPathData } from '#components/icons/tau.js';
import { useColor } from '#hooks/use-color.js';

const faviconBase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="{color}" d="${tauLogoPathData}"/></svg>`;

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- infer type for hooks
export function useFavicon() {
  const color = useColor();

  const updateFavicon = useCallback((color: string) => {
    // Create the SVG string with the new color
    const svgContent = faviconBase.replace('{color}', color);

    // Convert SVG to base64 data URL
    const encodedSvg = stringToBase64(svgContent);
    const dataUrl = `data:image/svg+xml;base64,${encodedSvg}`;

    // Find existing favicon or create new one
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      document.head.append(link);
    }

    // Update favicon
    link.href = dataUrl;
  }, []);

  // Automatically update favicon when color changes
  useEffect(() => {
    if (color.serialized.hex) {
      updateFavicon(color.serialized.hex);
    }
  }, [color.serialized.hex, updateFavicon]);

  return { setFaviconColor: updateFavicon };
}
