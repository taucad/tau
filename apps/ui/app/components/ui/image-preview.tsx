import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@taucad/ui/utils/cn';
import { Dialog, DialogContent } from '@taucad/ui/components/dialog';

type ImagePreviewContextValue = {
  src: string;
  alt: string;
  label?: string;
  onError?: () => void;
  openDialog: () => void;
};

const ImagePreviewContext = React.createContext<ImagePreviewContextValue | undefined>(undefined);

function useImagePreviewContext(): ImagePreviewContextValue {
  const context = React.useContext(ImagePreviewContext);

  if (!context) {
    throw new Error('ImagePreview components must be used within an ImagePreview');
  }

  return context;
}

type ImagePreviewProps = {
  /** Image source URL */
  readonly src: string;
  /** Alt text for accessibility */
  readonly alt: string;
  /** Optional label to display as overlay on the dialog content */
  readonly label?: string;
  /** Callback when image fails to load */
  readonly onError?: () => void;
  /** Children (should include ImagePreviewTrigger and ImagePreviewImage) */
  readonly children: React.ReactNode;
  /** Additional props to spread onto the dialog backdrop and content (e.g., focus trap attributes) */
  readonly dialogProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
};

function ImagePreview({ src, alt, label, onError, children, dialogProps }: ImagePreviewProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  const openDialog = React.useCallback(() => {
    setOpen(true);
  }, []);

  const contextValue = React.useMemo<ImagePreviewContextValue>(
    () => ({
      src,
      alt,
      label,
      onError,
      openDialog,
    }),
    [src, alt, label, onError, openDialog],
  );

  return (
    <ImagePreviewContext.Provider value={contextValue}>
      <Dialog open={open} modal={false} onOpenChange={setOpen}>
        {children}
        {open ? (
          <>
            {/* Backdrop via portal to ensure it's above all other content */}
            {createPortal(
              <div
                aria-hidden='true'
                className='fixed inset-0 z-100 animate-in bg-black/60 fade-in-0'
                {...dialogProps}
                onClick={() => {
                  setOpen(false);
                }}
              />,
              document.body,
            )}
            <DialogContent
              {...dialogProps}
              className='z-101! flex h-[80vh]! max-h-none! w-auto! max-w-none! items-center justify-center overflow-visible rounded-lg border bg-background p-2 shadow-lg *:data-[slot=dialog-close]:bg-background'
            >
              <div className='relative h-full'>
                <img
                  alt={alt}
                  className='h-full w-auto rounded-lg object-contain'
                  loading='lazy'
                  src={src}
                  onError={onError}
                />
                {/* Label overlay on top-left */}
                {label ? (
                  <div className='absolute top-1 left-1 rounded bg-black/60 px-2 py-1 text-xs font-medium tracking-wide text-white uppercase'>
                    {label}
                  </div>
                ) : undefined}
              </div>
            </DialogContent>
          </>
        ) : undefined}
      </Dialog>
    </ImagePreviewContext.Provider>
  );
}

type ImagePreviewTriggerProps = {
  /** Children to render as the clickable trigger */
  readonly children: React.ReactNode;
};

function ImagePreviewTrigger({ children }: ImagePreviewTriggerProps): React.JSX.Element {
  const { openDialog } = useImagePreviewContext();

  return (
    <div
      role='button'
      tabIndex={0}
      onMouseDown={(event) => {
        // Prevent blur events from firing on parent elements (e.g., textarea losing focus)
        event.preventDefault();
      }}
      onClick={(event) => {
        event.stopPropagation();
        openDialog();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          openDialog();
        }
      }}
    >
      {children}
    </div>
  );
}

type ImagePreviewImageProps = {
  /** Additional classes for the image element */
  readonly className?: string;
};

function ImagePreviewImage({ className }: ImagePreviewImageProps): React.JSX.Element {
  const { src, alt, onError } = useImagePreviewContext();

  return <img src={src} alt={alt} className={cn('cursor-pointer', className)} loading='lazy' onError={onError} />;
}

export { ImagePreview, ImagePreviewTrigger, ImagePreviewImage };
