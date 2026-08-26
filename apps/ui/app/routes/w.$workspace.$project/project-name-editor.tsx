import { useState, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Loader } from '#components/ui/loader.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';

export function ProjectNameEditor(): React.JSX.Element {
  const { projectRef, updateName } = useProject();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? '';
  const isLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const isProjectError = useSelector(projectRef, (state) => state.matches('error'));

  const [displayName, setDisplayName] = useState<string>(projectName);

  useEffect(() => {
    if (!isLoading && projectName) {
      setDisplayName(projectName);
    }
  }, [projectName, isLoading]);

  const renderDisplayContent = (value: string): React.ReactNode => {
    if (isProjectError) {
      return 'Project unavailable';
    }

    if (value === '') {
      return <Loader />;
    }

    return value;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InlineTextEditor
          value={displayName}
          isDisabled={isProjectError}
          className='h-7 [&_[data-slot=button]]:w-auto [&_[data-slot=button]]:max-w-48'
          renderDisplay={(value) => <span className='truncate'>{renderDisplayContent(value)}</span>}
          onSave={(value) => {
            updateName(value);
            setDisplayName(value);
          }}
        />
      </TooltipTrigger>
      <TooltipContent>{isProjectError ? 'Project unavailable' : 'Edit name'}</TooltipContent>
    </Tooltip>
  );
}
