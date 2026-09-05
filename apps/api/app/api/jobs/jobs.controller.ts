/* oxlint-disable new-cap -- NestJS decorators are factories */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '#auth/auth.guard.js';
import { PublicAuth, UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import {
  CancelJobDto,
  FinishJobAttemptDto,
  HeartbeatJobAttemptDto,
  ReportJobProgressDto,
  RegisterJobRunnerDto,
  RetryJobAttemptDto,
  StartJobAttemptDto,
  SubmitJobDto,
  WorkerArtifactAbortUploadDto,
  WorkerArtifactCompleteUploadDto,
  WorkerArtifactDownloadDto,
  WorkerArtifactUploadPartDto,
  WorkerArtifactUploadDto,
  WorkerActionPublishDto,
  WorkerActionReadDto,
  workerActionRecordSchema,
} from '#api/jobs/jobs.dto.js';
import { JobsService } from '#api/jobs/jobs.service.js';
import { jobActionRecordStorageKey, jobArtifactChecksum, jobArtifactStorageKey } from '#api/jobs/job-artifacts.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

const multipartArtifactThreshold = 32 * 1024 * 1024;
const multipartArtifactPartSize = 16 * 1024 * 1024;
const actionRecordContentType = 'application/vnd.tau.compute-action+json';
const actionRecordByteLimit = 64 * 1024;

const readBoundedBytes = async (
  body: AsyncIterable<unknown> & { destroy?: () => void },
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  for await (const chunk of body) {
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
      body.destroy?.();
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_INVALID_CHUNK' });
    }
    const bytes = Uint8Array.from(chunk);
    size += bytes.byteLength;
    if (size > limit) {
      body.destroy?.();
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_TOO_LARGE' });
    }
    chunks.push(bytes);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

@Controller({ path: 'jobs', version: '1' })
@UseGuards(AuthGuard)
export class JobsController {
  public constructor(
    private readonly jobs: JobsService,
    private readonly hosts: HostsService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  @Post()
  @UseAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  public async submit(
    @Body() body: SubmitJobDto,
    @User('id') ownerId: string,
  ): Promise<Awaited<ReturnType<JobsService['submit']>>> {
    return this.jobs.submit({ ownerId, ...body });
  }

  @Get()
  @UseAuth()
  public async list(
    @User('id') ownerId: string,
    @Query('projectId') projectId?: string,
  ): Promise<Awaited<ReturnType<JobsService['list']>>> {
    return this.jobs.list({ ownerId, ...(projectId ? { projectId } : {}) });
  }

  @Get(':jobId')
  @UseAuth()
  public async get(@Param('jobId') jobId: string, @User('id') ownerId: string): Promise<Record<string, unknown>> {
    const job = await this.jobs.get({ ownerId, jobId });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    return job;
  }

  @Post(':jobId/cancel')
  @UseAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  public async cancel(
    @Param('jobId') jobId: string,
    @Body() body: CancelJobDto,
    @User('id') ownerId: string,
  ): Promise<{ readonly accepted: true }> {
    const outcome = await this.jobs.requestCancellation({ ownerId, jobId, reason: body.reason });
    if (outcome === 'not-found') {
      throw new NotFoundException('Job not found.');
    }
    if (outcome === 'terminal') {
      throw new ConflictException({ code: 'JOB_ALREADY_TERMINAL' });
    }
    return { accepted: true };
  }

  @Post('worker-artifacts/uploads')
  @PublicAuth()
  public async createWorkerArtifactUpload(
    @Body() body: WorkerArtifactUploadDto,
    @Headers('authorization') authorization?: string,
  ): Promise<
    | { readonly mode: 'existing'; readonly storageKey: string }
    | {
        readonly mode: 'single';
        readonly storageKey: string;
        readonly uploadUrl: string;
        readonly headers: Readonly<Record<string, string>>;
      }
    | {
        readonly mode: 'multipart';
        readonly storageKey: string;
        readonly uploadId: string;
        readonly partSize: number;
      }
  > {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const { ownerId } = device;
    const storageKey = jobArtifactStorageKey(ownerId, body.digest);
    const existing = await this.objectStorage.headBlob({ namespace: 'blobs', key: storageKey, tier: 'private' });
    if (existing?.size === body.size && existing.contentType === body.mediaType) {
      return { mode: 'existing', storageKey };
    }
    if (body.size >= multipartArtifactThreshold) {
      const uploadId = await this.objectStorage.createMultipartUpload({
        namespace: 'blobs',
        key: storageKey,
        contentType: body.mediaType,
        tier: 'private',
      });
      return { mode: 'multipart', storageKey, uploadId, partSize: multipartArtifactPartSize };
    }
    const checksum = jobArtifactChecksum(body.digest);
    const uploadUrl = await this.objectStorage.presignPut({
      namespace: 'blobs',
      key: storageKey,
      contentType: body.mediaType,
      contentLength: body.size,
      checksumSha256: checksum,
      expiresInSeconds: 900,
      tier: 'private',
    });
    return {
      mode: 'single',
      storageKey,
      uploadUrl,
      headers: { 'content-type': body.mediaType, 'x-amz-checksum-sha256': checksum },
    };
  }

  @Post('worker-artifacts/uploads/parts')
  @PublicAuth()
  public async createWorkerArtifactUploadPart(
    @Body() body: WorkerArtifactUploadPartDto,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly uploadUrl: string; readonly headers: Readonly<Record<string, string>> }> {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const { ownerId } = device;
    const storageKey = jobArtifactStorageKey(ownerId, body.digest);
    const uploadUrl = await this.objectStorage.presignUploadPart({
      namespace: 'blobs',
      key: storageKey,
      uploadId: body.uploadId,
      partNumber: body.partNumber,
      checksumSha256: body.checksumSha256,
      expiresInSeconds: 900,
      tier: 'private',
    });
    return { uploadUrl, headers: { 'x-amz-checksum-sha256': body.checksumSha256 } };
  }

  @Post('worker-artifacts/uploads/complete')
  @PublicAuth()
  public async completeWorkerArtifactUpload(
    @Body() body: WorkerArtifactCompleteUploadDto,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly completed: true }> {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const { ownerId } = device;
    const storageKey = jobArtifactStorageKey(ownerId, body.digest);
    await this.objectStorage.completeMultipartUpload({
      namespace: 'blobs',
      key: storageKey,
      uploadId: body.uploadId,
      parts: body.parts,
      tier: 'private',
    });
    return { completed: true };
  }

  @Post('worker-artifacts/uploads/abort')
  @PublicAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async abortWorkerArtifactUpload(
    @Body() body: WorkerArtifactAbortUploadDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const { ownerId } = device;
    const storageKey = jobArtifactStorageKey(ownerId, body.digest);
    await this.objectStorage.abortMultipartUpload({
      namespace: 'blobs',
      key: storageKey,
      uploadId: body.uploadId,
      tier: 'private',
    });
  }

  @Post('worker-artifacts/downloads')
  @PublicAuth()
  public async createWorkerArtifactDownload(
    @Body() body: WorkerArtifactDownloadDto,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly downloadUrl: string }> {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const { ownerId } = device;
    const storageKey = jobArtifactStorageKey(ownerId, body.digest);
    const downloadUrl = await this.objectStorage.presignGet({
      namespace: 'blobs',
      key: storageKey,
      expiresInSeconds: 900,
      tier: 'private',
    });
    return { downloadUrl };
  }

  @Post('worker-artifacts/actions/read')
  @PublicAuth()
  public async readWorkerAction(
    @Body() body: WorkerActionReadDto,
    @Headers('authorization') authorization?: string,
  ): Promise<
    { readonly status: 'miss' } | { readonly status: 'hit'; readonly record: WorkerActionPublishDto['record'] }
  > {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    const key = jobActionRecordStorageKey(device.ownerId, body.jobId, body.actionDigest);
    const metadata = await this.objectStorage.headBlob({ namespace: 'blobs', key, tier: 'private' });
    if (!metadata) {
      return { status: 'miss' };
    }
    if (metadata.contentType !== actionRecordContentType || metadata.size > actionRecordByteLimit) {
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_INVALID' });
    }
    const stored = await this.objectStorage.getBlob({ namespace: 'blobs', key, tier: 'private' });
    const bytes = await readBoundedBytes(stored.body, actionRecordByteLimit);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_INVALID' });
    }
    const parsed = workerActionRecordSchema.safeParse(value);
    if (!parsed.success || parsed.data.actionDigest !== body.actionDigest) {
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_INVALID' });
    }
    await this.assertActionReferences(device.ownerId, body.jobId, parsed.data);
    return { status: 'hit', record: parsed.data };
  }

  @Post('worker-artifacts/actions/publish')
  @PublicAuth()
  public async publishWorkerAction(
    @Body() body: WorkerActionPublishDto,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly status: 'published' | 'existing' }> {
    const device = await this.authenticateRunner(authorization);
    await this.authorizeArtifactAttempt(device, body);
    await this.assertActionReferences(device.ownerId, body.jobId, body.record);
    const key = jobActionRecordStorageKey(device.ownerId, body.jobId, body.record.actionDigest);
    const bytes = new TextEncoder().encode(JSON.stringify(body.record));
    if (bytes.byteLength > actionRecordByteLimit) {
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_TOO_LARGE' });
    }
    const publication = await this.objectStorage.putBlob({
      namespace: 'blobs',
      key,
      body: bytes,
      contentType: actionRecordContentType,
      ifNoneMatch: '*',
      tier: 'private',
    });
    if (!publication.alreadyExisted) {
      return { status: 'published' };
    }
    const existing = await this.readWorkerAction(
      {
        jobId: body.jobId,
        attemptId: body.attemptId,
        attempt: body.attempt,
        actionDigest: body.record.actionDigest,
      },
      authorization,
    );
    if (existing.status !== 'hit' || JSON.stringify(existing.record) !== JSON.stringify(body.record)) {
      throw new ConflictException({ code: 'JOB_ACTION_RECORD_CONFLICT' });
    }
    return { status: 'existing' };
  }

  @Get(':jobId/artifacts/:artifactId')
  @UseAuth()
  public async getArtifact(
    @Param('jobId') jobId: string,
    @Param('artifactId') artifactId: string,
    @User('id') ownerId: string,
  ): Promise<{
    readonly digest: string;
    readonly mediaType: string;
    readonly size: number;
    readonly storageKey: string;
    readonly downloadUrl: string;
  }> {
    const artifact = await this.jobs.getArtifact({ ownerId, jobId, artifactId });
    if (!artifact) {
      throw new NotFoundException('Job artifact not found.');
    }
    const downloadUrl = await this.objectStorage.presignGet({
      namespace: 'blobs',
      key: artifact.storageKey,
      expiresInSeconds: 900,
      tier: 'private',
    });
    return { ...artifact, downloadUrl };
  }

  @Post(':jobId/attempts/start')
  @PublicAuth()
  public async startAttempt(
    @Param('jobId') jobId: string,
    @Body() body: StartJobAttemptDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['startAttempt']>>> {
    const device = await this.authenticateRunner(authorization);
    return this.jobs.startAttempt({ ownerId: device.ownerId, jobId, ...body, runnerId: device.id });
  }

  @Post(':jobId/attempts/heartbeat')
  @PublicAuth()
  public async heartbeatAttempt(
    @Param('jobId') jobId: string,
    @Body() body: HeartbeatJobAttemptDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['heartbeatAttempt']>>> {
    const device = await this.authenticateRunner(authorization);
    return this.jobs.heartbeatAttempt({ ownerId: device.ownerId, jobId, ...body, runnerId: device.id });
  }

  @Post(':jobId/attempts/progress')
  @PublicAuth()
  public async reportProgress(
    @Param('jobId') jobId: string,
    @Body() body: ReportJobProgressDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['reportProgress']>>> {
    const device = await this.authenticateRunner(authorization);
    return this.jobs.reportProgress({ ownerId: device.ownerId, jobId, ...body, runnerId: device.id });
  }

  @Post(':jobId/attempts/retrying')
  @PublicAuth()
  public async retryAttempt(
    @Param('jobId') jobId: string,
    @Body() body: RetryJobAttemptDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['retryAttempt']>>> {
    const device = await this.authenticateRunner(authorization);
    return this.jobs.retryAttempt({ ownerId: device.ownerId, jobId, ...body, runnerId: device.id });
  }

  @Post(':jobId/attempts/finish')
  @PublicAuth()
  public async finishAttempt(
    @Param('jobId') jobId: string,
    @Body() body: FinishJobAttemptDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['finishAttempt']>>> {
    const device = await this.authenticateRunner(authorization);
    return this.jobs.finishAttempt({ ownerId: device.ownerId, jobId, ...body, runnerId: device.id });
  }

  @Post('runners/register')
  @PublicAuth()
  public async registerRunner(
    @Body() body: RegisterJobRunnerDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['registerRunner']>>> {
    const device = await this.authenticateAgent(authorization);
    return this.jobs.registerRunner({
      ownerId: device.ownerId,
      runnerId: device.id,
      capabilities: body.capabilities,
      slots: body.slots,
    });
  }

  @Post('runners/heartbeat')
  @PublicAuth()
  public async heartbeatRunner(
    @Headers('authorization') authorization?: string,
  ): Promise<Awaited<ReturnType<JobsService['heartbeatRunner']>>> {
    const device = await this.authenticateAgent(authorization);
    return this.jobs.heartbeatRunner({ ownerId: device.ownerId, runnerId: device.id });
  }

  @Post('runners/drain')
  @PublicAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async drainRunner(@Headers('authorization') authorization?: string): Promise<void> {
    const device = await this.authenticateAgent(authorization);
    await this.jobs.drainRunner({ ownerId: device.ownerId, runnerId: device.id });
  }

  private async authenticateAgent(authorization: string | undefined) {
    const device = await this.hosts.authenticateDevice(authorization);
    if (!device) {
      throw new UnauthorizedException({ code: 'AGENT_CREDENTIAL_REJECTED' });
    }
    return device;
  }

  private async authenticateRunner(authorization: string | undefined) {
    const device = await this.authenticateAgent(authorization);
    if (!(await this.jobs.isRunnerAuthorized({ ownerId: device.ownerId, runnerId: device.id }))) {
      throw new ForbiddenException({ code: 'JOB_RUNNER_NOT_ACTIVE' });
    }
    return device;
  }

  private async authorizeArtifactAttempt(
    device: { readonly id: string; readonly ownerId: string },
    attempt: { readonly jobId: string; readonly attemptId: string; readonly attempt: number },
  ): Promise<void> {
    const authorized = await this.jobs.isArtifactAttemptAuthorized({
      ownerId: device.ownerId,
      runnerId: device.id,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      attempt: attempt.attempt,
    });
    if (!authorized) {
      throw new ForbiddenException({ code: 'JOB_ARTIFACT_ATTEMPT_REJECTED' });
    }
  }

  private async assertActionReferences(
    ownerId: string,
    jobId: string,
    record: WorkerActionPublishDto['record'],
  ): Promise<void> {
    const output = await this.objectStorage.headBlob({
      namespace: 'blobs',
      key: jobArtifactStorageKey(ownerId, record.output.digest),
      tier: 'private',
    });
    if (!output || output.size !== record.output.size) {
      throw new ConflictException({ code: 'JOB_ACTION_OUTPUT_NOT_COMMITTED' });
    }
    const dependencies = await Promise.all(
      record.dependencies.map(async (dependency) =>
        this.objectStorage.headBlob({
          namespace: 'blobs',
          key: jobActionRecordStorageKey(ownerId, jobId, dependency),
          tier: 'private',
        }),
      ),
    );
    if (dependencies.some((dependency) => dependency === undefined)) {
      throw new ConflictException({ code: 'JOB_ACTION_DEPENDENCY_NOT_COMMITTED' });
    }
  }
}
