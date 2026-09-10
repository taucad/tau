# libcascade — PSO

1 top-level symbols. Signatures are verbatim typescript.

// Describes particle pool for using in PSO algorithm
PSO_Particle: declare class PSO_Particle

constructor

Distance: number

BestDistance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
