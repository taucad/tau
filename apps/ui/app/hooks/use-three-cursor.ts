import { useState, useEffect } from 'react';

type UseCursorOptions = {
  /**
   * Base64 string of the rotate icon
   */
  rotateIconBase64: string;
};

/**
 * Hook to manage cursor state based on mouse and keyboard interactions
 */
export function useThreeCursor({ rotateIconBase64 }: UseCursorOptions): {
  /**
   * The cursor to use for styling
   */
  cursor: string;
  /**
   * Handle mouse down event. Passed to the canvas element.
   */
  handleMouseDown: (event: React.MouseEvent) => void;
  /**
   * Handle mouse up event. Passed to the canvas element.
   */
  handleMouseUp: (event: React.MouseEvent) => void;
  /**
   * Handle context menu event. Passed to the canvas element.
   */
  handleContextMenu: (event: React.MouseEvent) => void;
} {
  const [isRightMouseDown, setIsRightMouseDown] = useState(false);
  const [isLeftMouseDown, setIsLeftMouseDown] = useState(false);
  const [isShiftKeyDown, setIsShiftKeyDown] = useState(false);
  const [isCtrlKeyDown, setIsCtrlKeyDown] = useState(false);
  const [isMetaKeyDown, setIsMetaKeyDown] = useState(false);

  // Reset all states
  const resetAllStates = () => {
    setIsRightMouseDown(false);
    setIsLeftMouseDown(false);
    setIsShiftKeyDown(false);
    setIsCtrlKeyDown(false);
    setIsMetaKeyDown(false);
  };

  // Reset state on window blur
  useEffect(() => {
    const handleBlur = () => {
      resetAllStates();
    };

    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('blur', handleBlur);
      // Also reset state on unmount
      resetAllStates();
    };
  }, []);

  // Track key states
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Shift': {
          setIsShiftKeyDown(true);
          break;
        }

        case 'Control': {
          setIsCtrlKeyDown(true);
          break;
        }

        case 'Meta': {
          setIsMetaKeyDown(true);
          break;
        }

        default: {
          // No action needed for other keys
          break;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Shift': {
          setIsShiftKeyDown(false);
          break;
        }

        case 'Control': {
          setIsCtrlKeyDown(false);
          break;
        }

        case 'Meta': {
          setIsMetaKeyDown(false);
          break;
        }

        default: {
          // No action needed for other keys
          break;
        }
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle global mouse up to ensure state is reset even if released outside
  useEffect(() => {
    const handleGlobalMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        setIsRightMouseDown(false);
      } else if (event.button === 0) {
        setIsLeftMouseDown(false);
      }
    };

    globalThis.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      globalThis.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Determine cursor based on current state combinations
  const getCursor = () => {
    // Shift + right click: rotate icon
    if (isShiftKeyDown && isRightMouseDown) {
      return `url(data:image/svg+xml;base64,${rotateIconBase64}) 13 13, auto`;
    }

    // Shift + left click: grabbing hand icon
    if (isShiftKeyDown && isLeftMouseDown) {
      return 'grabbing';
    }

    // Ctrl + right click: rotate icon
    if (isCtrlKeyDown && isRightMouseDown) {
      return `url(data:image/svg+xml;base64,${rotateIconBase64}) 13 13, auto`;
    }

    // Ctrl + left click: grabbing hand icon
    if (isCtrlKeyDown && isLeftMouseDown) {
      return 'grabbing';
    }

    // Meta + right click: rotate icon
    if (isMetaKeyDown && isRightMouseDown) {
      return `url(data:image/svg+xml;base64,${rotateIconBase64}) 13 13, auto`;
    }

    // Meta + left click: grabbing hand icon
    if (isMetaKeyDown && isLeftMouseDown) {
      return 'grabbing';
    }

    // Any modifier key is pressed: show grab cursor
    if (isShiftKeyDown || isCtrlKeyDown || isMetaKeyDown) {
      return 'grab';
    }

    // Default right click behavior: grabbing hand
    if (isRightMouseDown) {
      return 'grabbing';
    }

    // Default cursor
    return `url(data:image/svg+xml;base64,${rotateIconBase64}) 13 13, auto`;
  };

  // Event handlers to be attached to the canvas
  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 2) {
      // Right mouse button
      setIsRightMouseDown(true);
    } else if (event.button === 0) {
      // Left mouse button
      setIsLeftMouseDown(true);
    }
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (event.button === 2) {
      // Right mouse button
      setIsRightMouseDown(false);
    } else if (event.button === 0) {
      // Left mouse button
      setIsLeftMouseDown(false);
    }
  };

  // Prevent context menu on right click
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return {
    cursor: getCursor(),
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
  };
}
