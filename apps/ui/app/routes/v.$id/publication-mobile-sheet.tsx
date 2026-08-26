import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '#components/ui/drawer.js';
import { Button } from '#components/ui/button.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { PublicationParamsPane } from '#routes/v.$id/publication-params-pane.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

type PublicationMobileSheetProps = {
  readonly publication: ParsedPublication;
};

const drawerSnapPoints = [0.45, 0.92] as const;

export const PublicationMobileSheet = ({ publication }: PublicationMobileSheetProps): React.ReactNode => {
  const isMobile = useIsMobile();
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- Vaul Drawer activeSnapPoint accepts null
  const [snap, setSnap] = useState<number | string | null>(drawerSnapPoints[0]);

  if (!isMobile) {
    return null;
  }

  return (
    <Drawer
      modal
      shouldScaleBackground={false}
      snapPoints={[...drawerSnapPoints]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerTrigger asChild>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          className='fixed right-4 bottom-4 z-40 shadow-md'
          data-slot='publication-mobile-sheet-trigger'
        >
          <Settings2 className='mr-1.5 size-4' aria-hidden />
          Parameters
        </Button>
      </DrawerTrigger>
      <DrawerContent data-slot='publication-mobile-sheet-content'>
        <DrawerHeader className='sticky top-0 z-10 border-b bg-background'>
          <DrawerTitle>{publication.title}</DrawerTitle>
          <DrawerDescription>{publication.ownerSnapshot?.name ?? 'Anonymous'}</DrawerDescription>
        </DrawerHeader>
        <div className='flex-1 overflow-y-auto p-4'>
          <PublicationParamsPane publication={publication} />
        </div>
      </DrawerContent>
    </Drawer>
  );
};
