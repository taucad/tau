# libcascade — IntAna

8 top-level symbols. Signatures are verbatim typescript.

IntAna_Curve: declare class IntAna_Curve

constructor

SetCylinderQuadValues(Cylinder: gp_Cylinder, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

SetConeQuadValues(Cone: gp_Cone, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

IsOpen(): boolean;

Domain(theFirst?: number, theLast?: number): { theFirst: number; theLast: number };

IsConstant(): boolean;

IsFirstOpen(): boolean;

IsLastOpen(): boolean;

Value(Theta: number): gp_Pnt;

D1u(Theta: number, P: gp_Pnt, V: gp_Vec): boolean;

FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;

SetIsFirstOpen(Flag: boolean): void;

SetIsLastOpen(Flag: boolean): void;

SetDomain(theFirst: number, theLast: number): void;

delete(): void;

[Symbol.dispose](): void;

IntAna_Int3Pln: declare class IntAna_Int3Pln

constructor

Perform(P1: gp_Pln, P2: gp_Pln, P3: gp_Pln): void;

IsDone(): boolean;

IsEmpty(): boolean;

Value(): gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

IntAna_IntConicQuad: declare class IntAna_IntConicQuad

constructor

Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;

IsDone(): boolean;

IsInQuadric(): boolean;

IsParallel(): boolean;

NbPoints(): number;

Point(N: number): gp_Pnt;

ParamOnConic(N: number): number;

delete(): void;

[Symbol.dispose](): void;

IntAna_IntLinTorus: declare class IntAna_IntLinTorus

constructor

Perform(L: gp_Lin, T: gp_Torus): void;

IsDone(): boolean;

NbPoints(): number;

Value(Index: number): gp_Pnt;

ParamOnLine(Index: number): number;

ParamOnTorus(Index: number, FI?: number, THETA?: number): { FI: number; THETA: number };

delete(): void;

[Symbol.dispose](): void;

IntAna_IntQuadQuad: declare class IntAna_IntQuadQuad

constructor

Perform(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cone, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cone, Q: IntAna_Quadric, Tol: number): void;

IsDone(): boolean;

IdenticalElements(): boolean;

NbCurve(): number;

Curve(N: number): IntAna_Curve;

NbPnt(): number;

Point(N: number): gp_Pnt;

Parameters(N: number, U1?: number, U2?: number): { U1: number; U2: number };

HasNextCurve(I: number): boolean;

NextCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

HasPreviousCurve(I: number): boolean;

PreviousCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

delete(): void;

[Symbol.dispose](): void;

IntAna_QuadQuadGeo: declare class IntAna_QuadQuadGeo

constructor

Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;

IsDone(): boolean;

TypeInter(): IntAna_ResultType;

NbSolutions(): number;

Point(Num: number): gp_Pnt;

Line(Num: number): gp_Lin;

Circle(Num: number): gp_Circ;

Ellipse(Num: number): gp_Elips;

Parabola(Num: number): gp_Parab;

Hyperbola(Num: number): gp_Hypr;

HasCommonGen(): boolean;

PChar(): gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

IntAna_Quadric: declare class IntAna_Quadric

constructor

SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;

Coefficients(xCXX?: number, xCYY?: number, xCZZ?: number, xCXY?: number, xCXZ?: number, xCYZ?: number, xCX?: number, xCY?: number, xCZ?: number, xCCte?: number): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

NewCoefficients(xCXX: number, xCYY: number, xCZZ: number, xCXY: number, xCXZ: number, xCYZ: number, xCX: number, xCY: number, xCZ: number, xCCte: number, Axis: gp_Ax3): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

SpecialPoints(): NCollection_List_gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

IntAna_ResultType: typeof IntAna_ResultType[keyof typeof IntAna_ResultType]
