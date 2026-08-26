import { Injectable } from '@nestjs/common';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { BaseMessage } from '@langchain/core/messages';

export type ProviderRequestRecord = {
  readonly runId: string;
  readonly messages: ReadonlyArray<readonly BaseMessage[]>;
};

// oxlint-disable-next-line eslint/new-cap -- NestJS decorators are factory calls.
@Injectable()
export class ProviderRequestRecorder extends BaseCallbackHandler {
  private enabled = false;
  private readonly records: ProviderRequestRecord[] = [];

  public override get name(): string {
    return 'ProviderRequestRecorder';
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }

  public clear(): void {
    this.records.length = 0;
  }

  public getRecords(): readonly ProviderRequestRecord[] {
    return [...this.records];
  }

  public override handleChatModelStart(_llm: unknown, messages: BaseMessage[][], runId: string): void {
    if (!this.enabled) {
      return;
    }

    this.records.push({
      runId,
      messages,
    });
  }
}
