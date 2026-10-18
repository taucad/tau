import { useStaticSearch } from 'fumadocs-core/search/client/orama-static';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import type { SharedProps } from 'fumadocs-ui/contexts/search';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from 'fumadocs-ui/components/dialog/search';

/** Keep the generated static index behind the provider's search interaction contract. */
export default function StaticSearchDialog({
  api,
  open,
  onOpenChange,
}: SharedProps & { readonly api?: string }): React.JSX.Element {
  const { locale } = useI18n();
  const search = useStaticSearch({ from: api, locale });

  return (
    <SearchDialog {...search} open={open} onOpenChange={onOpenChange}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList defaultItems={null} />
      </SearchDialogContent>
      <SearchDialogFooter />
    </SearchDialog>
  );
}
