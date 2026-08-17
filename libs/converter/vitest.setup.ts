// Used by three.js
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() cannot replace class assignment to globalThis
globalThis.ProgressEvent = class MockProgressEvent extends Event {
  public lengthComputable: boolean;
  public loaded: number;
  public total: number;

  public constructor(
    type: string,
    eventInitDict?: {
      lengthComputable?: boolean;
      loaded?: number;
      total?: number;
    },
  ) {
    super(type);
    this.lengthComputable = eventInitDict?.lengthComputable ?? false;
    this.loaded = eventInitDict?.loaded ?? 0;
    this.total = eventInitDict?.total ?? 0;
  }
} as unknown as typeof ProgressEvent;
