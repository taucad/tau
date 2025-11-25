import { GitBranch, ChevronDown } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

type BranchSelectorProperties = {
  readonly branches: Array<{ name: string; sha: string }>;
  readonly selectedBranch: string;
  readonly onSelect: (branch: string) => void;
  readonly isDisabled?: boolean;
};

export function BranchSelector(properties: BranchSelectorProperties): React.JSX.Element {
  const { branches, selectedBranch, onSelect, isDisabled } = properties;

  const groupedBranches = [
    {
      name: 'Branches',
      items: branches,
    },
  ];

  return (
    <ComboBoxResponsive
      groupedItems={groupedBranches}
      renderLabel={(branch, selected) => (
        <div className="flex items-center gap-2">
          <GitBranch className="size-4" />
          <span className={selected?.name === branch.name ? 'font-medium' : ''}>{branch.name}</span>
        </div>
      )}
      getValue={(branch) => branch.name}
      defaultValue={branches.find((b) => b.name === selectedBranch)}
      placeholder="Select branch..."
      searchPlaceHolder="Search branches..."
      title="Select Branch"
      description="Choose a branch to import"
      isDisabled={() => isDisabled ?? false}
      emptyListMessage="No branches found"
      withVirtualization={branches.length > 20}
      virtualizationHeight={300}
      className="w-full"
      onSelect={onSelect}
    >
      <Button variant="outline" className="w-full justify-between" disabled={isDisabled}>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4" />
          <span>{selectedBranch || 'Select branch...'}</span>
        </div>
        <ChevronDown className="size-4 shrink-0" />
      </Button>
    </ComboBoxResponsive>
  );
}
