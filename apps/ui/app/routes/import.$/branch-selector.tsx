import { useMemo } from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';

type Branch = {
  name: string;
  sha: string;
  updatedAt: number;
};

type BranchSelectorProperties = {
  readonly branches: Branch[];
  readonly selectedBranch: string;
  readonly isDisabled?: boolean;
  readonly isLoadingMore?: boolean;
  readonly onSelect: (branch: string) => void;
  readonly onLoadMore?: () => void;
};

type BranchGroup = {
  name: string;
  items: Branch[];
};

/**
 * Check if a branch is a default branch (main/master)
 */
function isDefaultBranch(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName === 'main' || lowerName === 'master';
}

export function BranchSelector(properties: BranchSelectorProperties): React.JSX.Element {
  const { branches, selectedBranch, isDisabled, isLoadingMore, onSelect, onLoadMore } = properties;

  // Group branches: Default first, then by last commit time
  const groupedBranches = useMemo((): BranchGroup[] => {
    // Separate default branches (main/master) from others
    const defaultBranches = branches.filter((branch) => isDefaultBranch(branch.name));
    const otherBranches = branches.filter((branch) => !isDefaultBranch(branch.name));

    const groups: BranchGroup[] = [];

    // Add default branches first if any exist
    if (defaultBranches.length > 0) {
      groups.push({
        name: 'Default',
        items: defaultBranches,
      });
    }

    // Add other branches grouped by temporal horizon
    const temporalGroups = groupItemsByTimeHorizon(otherBranches);
    groups.push(...temporalGroups);

    return groups;
  }, [branches]);

  return (
    <ComboBoxResponsive
      groupedItems={groupedBranches}
      renderLabel={(branch, selected) => (
        <div className='flex items-center gap-2'>
          <GitBranch className='size-4' />
          <span className={selected?.name === branch.name ? 'font-medium' : ''}>{branch.name}</span>
        </div>
      )}
      getValue={(branch) => branch.name}
      value={branches.find((b) => b.name === selectedBranch)}
      placeholder='Select branch...'
      searchPlaceHolder='Search branches...'
      title='Select Branch'
      description='Choose a branch to import'
      isDisabled={() => isDisabled ?? false}
      emptyListMessage='No branches found'
      withVirtualization={branches.length > 20}
      virtualizationHeight={300}
      className='w-full'
      isLoadingMore={isLoadingMore}
      onSelect={onSelect}
      onLoadMore={onLoadMore}
    >
      <Button variant='outline' className='w-full justify-between' disabled={isDisabled}>
        <div className='flex items-center gap-2'>
          <GitBranch className='size-4' />
          <span>{selectedBranch || 'Select branch...'}</span>
        </div>
        <ChevronDown className='size-4 shrink-0' />
      </Button>
    </ComboBoxResponsive>
  );
}
