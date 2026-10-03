import { beforeEach, expect, it, vi } from 'vitest';
import { machineSettingsPath, serializeMachineSettings } from '@taucad/runtime/machine/settings';
import { projectFiles } from '#components/print/testing/project-files.js';

const settingsPath = machineSettingsPath({ typeId: 'bambu.x1c' });
const settingsBytes = serializeMachineSettings({
  record: {
    version: 1,
    typeId: 'bambu.x1c',
    activeProfile: 'default',
    profiles: { default: { name: 'Default', configurations: {} } },
  },
});

beforeEach(() => {
  projectFiles.clear();
});

it('keeps a delayed settings write and watch within the project that started them', async () => {
  const oldRoot = projectFiles.fileManager.fileManagerRef.getSnapshot().context.rootDirectory;
  const oldFiles = projectFiles.fileManager.parameterFiles;
  const oldWatch = vi.fn();
  const stopOld = projectFiles.fileManager.contentService.subscribe(settingsPath, oldWatch);
  const release = Promise.withResolvers<void>();
  const pending = (async () => {
    await release.promise;
    return oldFiles.writeFileChecked({
      path: `${oldRoot}/${settingsPath}`,
      data: settingsBytes,
      preconditions: [{ path: `${oldRoot}/${settingsPath}`, expected: null }],
    });
  })();
  let stopFresh = (): void => undefined;
  try {
    projectFiles.clear();
    const freshWatch = vi.fn();
    stopFresh = projectFiles.fileManager.contentService.subscribe(settingsPath, freshWatch);

    release.resolve();
    expect(await pending).toMatchObject({ status: 'applied' });
    expect(projectFiles.read(settingsPath)).toBeUndefined();

    projectFiles.write(settingsPath, settingsBytes);
    expect(freshWatch).toHaveBeenCalledOnce();
    expect(oldWatch).not.toHaveBeenCalled();
  } finally {
    release.resolve();
    await pending;
    stopFresh();
    stopOld();
  }
});
