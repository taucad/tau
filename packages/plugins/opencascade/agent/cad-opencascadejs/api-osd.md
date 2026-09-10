# libcascade — OSD

5 top-level symbols. Signatures are verbatim typescript.

// Set of Operating System Dependent ({@link OSD`OSD`}) tools
OSD: declare class OSD

constructor

// Sets or removes signal and FPE (floating-point exception) handlers
static SetSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;
static SetSignal(theFloatingSignal: boolean): void;
static SetSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;
static SetSignal(theFloatingSignal: boolean): void;

// Initializes thread-local signal handlers
static SetThreadLocalSignal(theSignalMode: unknown, theFloatingSignal: boolean): void;

// Enables / disables generation of C signal on floating point exceptions (FPE)
static SetFloatingSignal(theFloatingSignal: boolean): void;

// Returns signal mode set by the last call to `SetSignal()`
static SignalMode(): unknown;

// Returns true if floating point exceptions will raise C signal according to current (platform-dependent) settings in this thread
static ToCatchFloatingSignals(): boolean;

// Commands the process to sleep for a number of seconds
static SecSleep(theSeconds: number): void;

// Commands the process to sleep for a number of milliseconds
static MilliSecSleep(theMilliseconds: number): void;

// Converts aCstring representing a real with a period as decimal point, no thousand separator and no grouping of digits into aReal
static CStringToReal(aString: string, aReal?: number): { returnValue: boolean; aReal: number };

// since Windows NT does not support 'SIGINT' signal like UNIX, then this method checks whether Ctrl-Break keystroke was or not
static ControlBreak(): void;

// Returns a length of stack trace to be put into exception redirected from signal
static SignalStackTraceLength(): number;

// Sets a length of stack trace to be put into exception redirected from signal
static SetSignalStackTraceLength(theLength: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Simple tool for code parallelization
OSD_Parallel: declare class OSD_Parallel

constructor

static ToUseOcctThreads(): boolean;

static SetUseOcctThreads(theToUseOcct: boolean): void;

static NbLogicalProcessors(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A simple platform-intependent interface to execute and control threads
OSD_Thread: declare class OSD_Thread

constructor

// Copy thread handle from other {@link OSD_Thread`OSD_Thread`} object
Assign(other: OSD_Thread): void;

SetPriority(thePriority: number): void;

// Detaches the execution thread from this Thread object, so that it cannot be waited
Detach(): void;

// Returns ID of the currently controlled thread ID, or 0 if no thread is run
GetId(): number;

// Auxiliary
static Current(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class defining a thread pool for executing algorithms in multi-threaded mode
OSD_ThreadPool: declare class OSD_ThreadPool extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return (or create) a default thread pool
static DefaultPool(theNbThreads?: number): OSD_ThreadPool;

// Return TRUE if at least 2 threads are available (including self-thread)
HasThreads(): boolean;

// Return the lower thread index
LowerThreadIndex(): number;

// Return the upper thread index (last index is reserved for self-thread)
UpperThreadIndex(): number;

// Return the number of threads
NbThreads(): number;

// Return maximum number of threads to be locked by a single {@link Launcher `Launcher`} object by default
NbDefaultThreadsToLaunch(): number;

// Set maximum number of threads to be locked by a single {@link Launcher `Launcher`} object by default
SetNbDefaultThreadsToLaunch(theNbThreads: number): void;

// Checks if thread pools has active consumers
IsInUse(): boolean;

// Reinitialize the thread pool with a different number of threads
Init(theNbThreads: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

OSD_ThreadPool_Launcher: declare class OSD_ThreadPool_Launcher

constructor

HasThreads(): boolean;

NbThreads(): number;

LowerThreadIndex(): number;

UpperThreadIndex(): number;

Release(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
