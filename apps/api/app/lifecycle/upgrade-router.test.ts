import { EventEmitter } from 'node:events';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { UpgradeRouter } from '#lifecycle/upgrade-router.js';
import { MetricsService } from '#telemetry/metrics.js';

const setup = () => {
  const shutdown = new ShutdownService();
  const metrics = new MetricsService();
  const rejections = vi.spyOn(metrics.wsUpgradeRejections, 'add');
  // oxlint-disable-next-line unicorn/prefer-event-target -- stands in for Node's http.Server
  const server = new EventEmitter();
  const handle = vi.fn();
  new UpgradeRouter(shutdown, metrics).route(server as unknown as HttpServer, {
    gateway: 'hosts',
    matches: (pathname) => pathname === '/socket',
    handle,
  });
  const upgrade = (url: string) => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- stands in for a Node Duplex
    const socket = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    server.emit('upgrade', { url } as IncomingMessage, socket as unknown as Duplex, Buffer.alloc(0));
    return socket;
  };
  return { shutdown, rejections, handle, upgrade };
};

describe('UpgradeRouter rejections', () => {
  it('should count an unclaimed path as unknown_route and refuse it', () => {
    const { rejections, handle, upgrade } = setup();

    const socket = upgrade('/nowhere');

    expect(rejections).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'none', reason: 'unknown_route' });
    expect(socket.end).toHaveBeenCalledWith(expect.stringContaining('404'), expect.any(Function));
    expect(handle).not.toHaveBeenCalled();
  });

  it('should count an upgrade during shutdown as server_shutdown', () => {
    const { shutdown, rejections, handle, upgrade } = setup();
    shutdown.stop();

    upgrade('/socket');

    expect(rejections).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'hosts', reason: 'server_shutdown' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('should label a shutdown refusal on an unclaimed path with no gateway', () => {
    const { shutdown, rejections, upgrade } = setup();
    shutdown.stop();

    upgrade('/nowhere');

    expect(rejections).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'none', reason: 'server_shutdown' });
  });

  it('should record nothing for a routed upgrade', () => {
    const { rejections, handle, upgrade } = setup();

    upgrade('/socket');

    expect(handle).toHaveBeenCalledOnce();
    expect(rejections).not.toHaveBeenCalled();
  });
});
