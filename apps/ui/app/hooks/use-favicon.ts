import { useCallback, useEffect } from 'react';
import { useColor } from '@/hooks/use-color';
import { debounce } from '@/utils/functions';

const FAVICON_BASE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="{color}"
        d="M166.001-14.001c60-60 120-60 180 0L526.002 166c59.996 60 59.996 120 0 180.001l-180.001 180c-60 60-120 60-180 0l-180-180c-60-60.001-60-120.001 0-180.001l180-180.001Z"
        paint-order="fill" style="transform-box:fill-box" transform="rotate(45 0 0)"
        transform-origin="50% 50%" />
    <path fill="#fff"
        d="m89.642 218.049-7.635-.054c-8.481-.061-12.723-3.077-12.723-9.05 0-2.133 2.12-6.171 6.361-12.113 35.202-47.533 70.403-73.094 105.605-76.683.424-.423 40.079-.354 118.964.208 78.461.56 118.964 1.275 121.508 2.146 4.665.46 9.33 2.626 13.997 6.499 4.664 3.873 6.997 10.29 6.997 19.248 0 18.347-8.058 31.515-24.175 39.506-4.665 2.1-9.966 3.343-15.904 3.727-5.938.383-26.083.453-60.436.208l-62.98-.448v1.28c-.425.423-2.758 15.339-6.999 44.747a4853.871 4853.871 0 0 1-13.996 90.773c-5.089 31.108-8.057 47.94-8.906 50.494-2.545 9.367-7.846 17.223-15.904 23.564-10.178 6.754-20.357 10.095-30.536 10.022-9.755-.069-17.6-2.898-23.538-8.486-5.938-5.588-9.119-13.078-9.543-22.468 0-3.839.212-6.61.636-8.314.424-2.131 10.39-31.71 29.899-88.742 19.511-57.029 30.113-87.671 31.809-91.926 0-.853-10.814-1.357-32.444-1.511l-12.087-.086c-19.509-.139-34.99.817-46.44 2.868-11.452 2.052-21.631 7.739-30.537 17.062l-6.999 6.99-13.994.539Z" />
</svg>`;

const DEBOUNCE_MS = 1;

export function useFavicon() {
  const color = useColor();

  const updateFavicon = useCallback((color: string) => {
    // Create the SVG string with the new color
    const svgContent = FAVICON_BASE.replace('{color}', color);

    // Convert SVG to base64 data URL
    const encodedSvg = btoa(svgContent);
    const dataUrl = `data:image/svg+xml;base64,${encodedSvg}`;

    // Find existing favicon or create new one
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      document.head.append(link);
    }

    // Update favicon
    link.href = dataUrl;
  }, []);

  const debouncedUpdateFavicon = useCallback(
    debounce((color: string) => updateFavicon(color), DEBOUNCE_MS),
    [updateFavicon],
  );

  // Automatically update favicon when color changes
  useEffect(() => {
    if (color.serialized?.hex) {
      debouncedUpdateFavicon(color.serialized.hex);
    }
  }, [color.serialized?.hex, debouncedUpdateFavicon]);

  return { setFaviconColor: debouncedUpdateFavicon };
}
