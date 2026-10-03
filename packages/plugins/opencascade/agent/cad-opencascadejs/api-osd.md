# libcascade — OSD

5 top-level symbols. Signatures are verbatim typescript.

OSD: declare class OSD

  // OSD.constructor (constructor)
  constructor();

  // OSD.SetSignal (method)
  static SetSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;
  static SetSignal(theFloatingSignal: boolean): void;

  // OSD.SetThreadLocalSignal (method)
  static SetThreadLocalSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;

  // OSD.SetFloatingSignal (method)
  static SetFloatingSignal(theFloatingSignal: boolean): void;

  // OSD.SignalMode (method)
  static SignalMode(): unknown;

  // OSD.ToCatchFloatingSignals (method)
  static ToCatchFloatingSignals(): boolean;

  // OSD.SecSleep (method)
  static SecSleep(theSeconds: number): void;

  // OSD.MilliSecSleep (method)
  static MilliSecSleep(theMilliseconds: number): void;

  // OSD.CStringToReal (method)
  static CStringToReal(aString: string, aReal?: number): { returnValue: boolean; aReal: number };

  // OSD.ControlBreak (method)
  static ControlBreak(): void;

  // OSD.SignalStackTraceLength (method)
  static SignalStackTraceLength(): number;

  // OSD.SetSignalStackTraceLength (method)
  static SetSignalStackTraceLength(theLength: number): void;

  // OSD.delete (method)
  delete(): void;

  // OSD.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

OSD_Parallel: declare class OSD_Parallel

  // OSD_Parallel.constructor (constructor)
  constructor();

  // OSD_Parallel.ToUseOcctThreads (method)
  static ToUseOcctThreads(): boolean;

  // OSD_Parallel.SetUseOcctThreads (method)
  static SetUseOcctThreads(theToUseOcct: boolean): void;

  // OSD_Parallel.NbLogicalProcessors (method)
  static NbLogicalProcessors(): number;

  // OSD_Parallel.delete (method)
  delete(): void;

  // OSD_Parallel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

OSD_Thread: declare class OSD_Thread

  // OSD_Thread.constructor (constructor)
  constructor();
  constructor(other: OSD_Thread);

  // OSD_Thread.Assign (method)
  Assign(other: OSD_Thread): void;

  // OSD_Thread.SetPriority (method)
  SetPriority(thePriority: number): void;

  // OSD_Thread.Detach (method)
  Detach(): void;

  // OSD_Thread.GetId (method)
  GetId(): number;

  // OSD_Thread.Current (method)
  static Current(): number;

  // OSD_Thread.delete (method)
  delete(): void;

  // OSD_Thread.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

OSD_ThreadPool: declare class OSD_ThreadPool extends Standard_Transient

  // OSD_ThreadPool.constructor (constructor)
  constructor(theNbThreads?: number);

  // OSD_ThreadPool.get_type_name (method)
  static get_type_name(): string;

  // OSD_ThreadPool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // OSD_ThreadPool.DynamicType (method)
  DynamicType(): Standard_Type;

  // OSD_ThreadPool.DefaultPool (method)
  static DefaultPool(theNbThreads?: number): OSD_ThreadPool;

  // OSD_ThreadPool.HasThreads (method)
  HasThreads(): boolean;

  // OSD_ThreadPool.LowerThreadIndex (method)
  LowerThreadIndex(): number;

  // OSD_ThreadPool.UpperThreadIndex (method)
  UpperThreadIndex(): number;

  // OSD_ThreadPool.NbThreads (method)
  NbThreads(): number;

  // OSD_ThreadPool.NbDefaultThreadsToLaunch (method)
  NbDefaultThreadsToLaunch(): number;

  // OSD_ThreadPool.SetNbDefaultThreadsToLaunch (method)
  SetNbDefaultThreadsToLaunch(theNbThreads: number): void;

  // OSD_ThreadPool.IsInUse (method)
  IsInUse(): boolean;

  // OSD_ThreadPool.Init (method)
  Init(theNbThreads: number): void;

  // OSD_ThreadPool.delete (method)
  delete(): void;

  // OSD_ThreadPool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

OSD_ThreadPool_Launcher: declare class OSD_ThreadPool_Launcher

  // OSD_ThreadPool_Launcher.constructor (constructor)
  constructor(thePool: OSD_ThreadPool, theMaxThreads?: number);

  // OSD_ThreadPool_Launcher.HasThreads (method)
  HasThreads(): boolean;

  // OSD_ThreadPool_Launcher.NbThreads (method)
  NbThreads(): number;

  // OSD_ThreadPool_Launcher.LowerThreadIndex (method)
  LowerThreadIndex(): number;

  // OSD_ThreadPool_Launcher.UpperThreadIndex (method)
  UpperThreadIndex(): number;

  // OSD_ThreadPool_Launcher.Release (method)
  Release(): void;

  // OSD_ThreadPool_Launcher.delete (method)
  delete(): void;

  // OSD_ThreadPool_Launcher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
