import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isPublicAuth } from '#constants/auth.constant.js';
import { RepositoriesController } from '#api/repositories/repositories.controller.js';
import type { RepositoriesService } from '#api/repositories/repositories.service.js';

describe('RepositoriesController', () => {
  it('keeps the archive endpoint public, forwards the client IP, and sends the gateway response', async () => {
    const getArchive = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store' },
      }),
    );
    const controller = new RepositoriesController({ getArchive } as unknown as RepositoriesService);
    const query = { provider: 'github', owner: 'taucad', repo: 'tau', ref: 'main' };
    const raw = { aborted: false, once: vi.fn(), off: vi.fn() };
    const request = { raw } as unknown as FastifyRequest;
    const reply = {
      status: vi.fn(),
      header: vi.fn(),
      send: vi.fn(),
    } as unknown as FastifyReply;

    await controller.getArchive(query, '203.0.113.7', request, reply);

    expect(getArchive).toHaveBeenCalledWith(query, '203.0.113.7', expect.any(AbortSignal));
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith('content-type', 'application/zip');
    expect(reply.send).toHaveBeenCalledWith(Buffer.from([1, 2]));
    expect(raw.once).toHaveBeenCalledWith('aborted', expect.any(Function));
    expect(raw.off).toHaveBeenCalledWith('aborted', expect.any(Function));
    expect(new Reflector().get(isPublicAuth, RepositoriesController.prototype.getArchive)).toBe(true);
  });

  it('keeps the branches endpoint public and forwards the client IP', async () => {
    const listBranches = vi.fn().mockResolvedValue({ branches: [], hasMore: false, endCursor: undefined });
    const controller = new RepositoriesController({ listBranches } as unknown as RepositoriesService);
    const query = { owner: 'taucad', repo: 'tau', pageSize: 100 };

    await expect(controller.listBranches(query, '203.0.113.7')).resolves.toStrictEqual({
      branches: [],
      hasMore: false,
      endCursor: undefined,
    });
    expect(listBranches).toHaveBeenCalledWith(query, '203.0.113.7');
    expect(new Reflector().get(isPublicAuth, RepositoriesController.prototype.listBranches)).toBe(true);
  });
});
