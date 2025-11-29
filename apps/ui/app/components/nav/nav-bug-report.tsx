import { Bug } from 'lucide-react';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { metaConfig } from '#constants/meta.constants.js';

function createBugReportUrl(): string {
  const title = encodeURIComponent('Bug Report');

  const browserInfo = typeof navigator === 'undefined' ? 'N/A' : navigator.userAgent;

  const bodyTemplate = `## Bug Description
<!-- Describe the bug you encountered -->


## Steps to Reproduce
1.
2.
3.

## Expected Behavior
<!-- What should have happened? -->


## Actual Behavior
<!-- What actually happened? -->


## Environment
- **Version**: ${metaConfig.version}
- **User Agent**: ${metaConfig.userAgent}
- **Browser**: ${browserInfo}

## Additional Context
<!-- Add any other context, screenshots, or information about the problem here -->
`;

  const body = encodeURIComponent(bodyTemplate);
  const labels = encodeURIComponent('bug');

  return `${metaConfig.githubUrl}/issues/new?title=${title}&body=${body}&labels=${labels}`;
}

export function NavBugReport(): React.JSX.Element {
  const bugReportUrl = createBugReportUrl();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarMenuButton asChild className="size-7">
          <a href={bugReportUrl} target="_blank" rel="noopener noreferrer">
            <Bug className="size-4" />
            <span className="sr-only">Report a bug</span>
          </a>
        </SidebarMenuButton>
      </TooltipTrigger>
      <TooltipContent side="top">Report a bug</TooltipContent>
    </Tooltip>
  );
}
