import { describe, expect, it, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('#lib/activity-breadcrumbs.js');
};

describe('activity breadcrumbs', () => {
  it('should hand the newest names recorded before the SDK started to it, in order, at most the limit', async () => {
    const { activityBreadcrumbLimit, recordActivityBreadcrumb, setActivityBreadcrumbSink } = await load();
    for (let index = 0; index < activityBreadcrumbLimit + 3; index += 1) {
      recordActivityBreadcrumb(index % 2 === 0 ? 'render' : 'export');
    }
    const sink = vi.fn();

    setActivityBreadcrumbSink(sink);
    recordActivityBreadcrumb('capture');

    expect(sink).toHaveBeenCalledTimes(activityBreadcrumbLimit + 1);
    expect(sink.mock.calls.at(-1)).toStrictEqual(['capture']);
  });

  it('should drop anything that is not a structural name, so content never reaches the trail', async () => {
    const { recordActivityBreadcrumb, setActivityBreadcrumbSink, isStructuralActivityName } = await load();
    const sink = vi.fn();
    setActivityBreadcrumbSink(sink);

    for (const name of ['open My Secret Project', 'file:/home/me/part.scad', 'Render', 'x'.repeat(65), '']) {
      recordActivityBreadcrumb(name);
    }
    recordActivityBreadcrumb('render.start');

    expect(sink.mock.calls).toStrictEqual([['render.start']]);
    expect(isStructuralActivityName('kernel.switch')).toBe(true);
  });

  it('should keep names again once the sink is removed', async () => {
    const { recordActivityBreadcrumb, setActivityBreadcrumbSink } = await load();
    const first = vi.fn();
    setActivityBreadcrumbSink(first);
    setActivityBreadcrumbSink(undefined);
    recordActivityBreadcrumb('render');
    const second = vi.fn();
    setActivityBreadcrumbSink(second);

    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toStrictEqual([['render']]);
  });
});
