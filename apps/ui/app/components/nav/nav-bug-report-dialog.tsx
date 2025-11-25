import { useState } from 'react';
import { Bug } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Textarea } from '#components/ui/textarea.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { metaConfig } from '#constants/meta.constants.js';

type BugReportFormData = {
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  additionalContext: string;
  includeBrowserInfo: boolean;
};

function createBugReportUrl(formData: BugReportFormData): string {
  const browserInfo = formData.includeBrowserInfo && typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';

  const bodyTemplate = `## Bug Description
${formData.description || '<!-- Describe the bug you encountered -->'}

## Steps to Reproduce
${formData.stepsToReproduce || '1.\n2.\n3.'}

## Expected Behavior
${formData.expectedBehavior || '<!-- What should have happened? -->'}

## Actual Behavior
${formData.actualBehavior || '<!-- What actually happened? -->'}

## Environment
- **Version**: ${metaConfig.version}
- **User Agent**: ${metaConfig.userAgent}
- **Browser**: ${browserInfo}

## Additional Context
${formData.additionalContext || '<!-- Add any other context, screenshots, or information about the problem here -->'}
`;

  const url = new URL(`${metaConfig.githubUrl}/issues/new`);
  url.searchParams.set('title', formData.title || 'Bug Report');
  url.searchParams.set('body', bodyTemplate);
  url.searchParams.set('labels', 'bug');

  return url.toString();
}

export function NavBugReportDialog(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<BugReportFormData>({
    title: '',
    description: '',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    additionalContext: '',
    includeBrowserInfo: true,
  });

  const handleSubmit = (): void => {
    const bugReportUrl = createBugReportUrl(formData);
    window.open(bugReportUrl, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
    // Reset form
    setFormData({
      title: '',
      description: '',
      stepsToReproduce: '',
      expectedBehavior: '',
      actualBehavior: '',
      additionalContext: '',
      includeBrowserInfo: true,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <SidebarMenuButton className="size-7">
              <Bug className="size-4" />
              <span className="sr-only">Report a bug</span>
            </SidebarMenuButton>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Report a bug</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Help us improve by reporting issues. You&apos;ll be taken to GitHub to submit your report.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="bug-title"
              placeholder="Brief summary of the bug"
              value={formData.title}
              onChange={(event) => {
                setFormData({ ...formData, title: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="bug-description"
              placeholder="Describe the bug you encountered"
              value={formData.description}
              onChange={(event) => {
                setFormData({ ...formData, description: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-steps" className="text-sm font-medium">
              Steps to Reproduce
            </label>
            <Textarea
              id="bug-steps"
              placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
              value={formData.stepsToReproduce}
              onChange={(event) => {
                setFormData({ ...formData, stepsToReproduce: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-expected" className="text-sm font-medium">
              Expected Behavior
            </label>
            <Textarea
              id="bug-expected"
              placeholder="What should have happened?"
              value={formData.expectedBehavior}
              onChange={(event) => {
                setFormData({ ...formData, expectedBehavior: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-actual" className="text-sm font-medium">
              Actual Behavior
            </label>
            <Textarea
              id="bug-actual"
              placeholder="What actually happened?"
              value={formData.actualBehavior}
              onChange={(event) => {
                setFormData({ ...formData, actualBehavior: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-context" className="text-sm font-medium">
              Additional Context
            </label>
            <Textarea
              id="bug-context"
              placeholder="Any other context, screenshots, or information"
              value={formData.additionalContext}
              onChange={(event) => {
                setFormData({ ...formData, additionalContext: event.target.value });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="browser-info"
              checked={formData.includeBrowserInfo}
              onCheckedChange={(checked) => {
                setFormData({ ...formData, includeBrowserInfo: Boolean(checked) });
              }}
            />
            <label htmlFor="browser-info" className="text-sm">
              Include browser information (recommended)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Continue to GitHub</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
