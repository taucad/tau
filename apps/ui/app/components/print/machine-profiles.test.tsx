import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { MachineSettingsHandle } from '#components/print/use-machine-settings.js';
import type { BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { MachineProfiles } from '#components/print/machine-profiles.js';

vi.mock('#components/geometry/parameters/parameter-select.js', () => ({
  ParameterSelect: ({ value }: { value: string }) => <div>{value}</div>,
}));

describe('machine profile observation recovery', () => {
  it('should retry unavailable observation without discarding a dirty profile draft', async () => {
    const retry = vi.fn(async () => undefined);
    const settings = mock<MachineSettingsHandle & { retry(): Promise<void> }>({
      file: { status: 'unavailable', code: 'SETTINGS_UNAVAILABLE', message: 'settings watch refused' },
      error: 'settings watch refused',
      record: {
        version: 1,
        typeId: 'bambu.x1c',
        activeProfile: 'draft',
        profiles: { draft: { name: 'Unsaved draft', configurations: {} } },
      },
      pending: 0,
      blocked: true,
      selectionBlocked: true,
      failure: undefined,
      retry,
    });
    const studio = mock<BambuStudioMode>({ processes: [] });
    render(
      <TooltipProvider>
        <MachineProfiles settings={settings} studio={studio} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('settings watch refused');
    await userEvent.click(screen.getByRole('button', { name: 'Retry settings updates' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(settings.useLatest).not.toHaveBeenCalled();
    expect(settings.updateRecord).not.toHaveBeenCalled();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});
