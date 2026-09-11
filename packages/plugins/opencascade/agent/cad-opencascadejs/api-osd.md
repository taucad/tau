# libcascade — OSD

5 top-level symbols. Signatures are verbatim typescript.

OSD: declare class OSD

constructor

static SetSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;
static SetSignal(theFloatingSignal: boolean): void;
static SetSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;
static SetSignal(theFloatingSignal: boolean): void;

static SetThreadLocalSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;

static SetFloatingSignal(theFloatingSignal: boolean): void;

static SignalMode(): unknown;

static ToCatchFloatingSignals(): boolean;

static SecSleep(theSeconds: number): void;

static MilliSecSleep(theMilliseconds: number): void;

static CStringToReal(aString: string, aReal?: number): { returnValue: boolean; aReal: number };

static ControlBreak(): void;

static SignalStackTraceLength(): number;

static SetSignalStackTraceLength(theLength: number): void;

delete(): void;

[Symbol.dispose](): void;

OSD_Parallel: declare class OSD_Parallel

constructor

static ToUseOcctThreads(): boolean;

static SetUseOcctThreads(theToUseOcct: boolean): void;

static NbLogicalProcessors(): number;

delete(): void;

[Symbol.dispose](): void;

OSD_Thread: declare class OSD_Thread

constructor

Assign(other: OSD_Thread): void;

SetPriority(thePriority: number): void;

Detach(): void;

GetId(): number;

static Current(): number;

delete(): void;

[Symbol.dispose](): void;

OSD_ThreadPool: declare class OSD_ThreadPool extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static DefaultPool(theNbThreads?: number): OSD_ThreadPool;

HasThreads(): boolean;

LowerThreadIndex(): number;

UpperThreadIndex(): number;

NbThreads(): number;

NbDefaultThreadsToLaunch(): number;

SetNbDefaultThreadsToLaunch(theNbThreads: number): void;

IsInUse(): boolean;

Init(theNbThreads: number): void;

delete(): void;

[Symbol.dispose](): void;

OSD_ThreadPool_Launcher: declare class OSD_ThreadPool_Launcher

constructor

HasThreads(): boolean;

NbThreads(): number;

LowerThreadIndex(): number;

UpperThreadIndex(): number;

Release(): void;

delete(): void;

[Symbol.dispose](): void;
