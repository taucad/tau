[![Apache 2.0 License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](license)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-7289da?logo=discord&logoColor=white)](https://discord.gg/6pfSAN3t7A)
[![XO code style](https://shields.io/badge/code_style-5ed9c7?logo=xo&labelColor=gray&logoSize=auto)](https://github.com/xojs/xo)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)

# Tau

The AI-native CAD platform — open-source, browser-based, and kernel-agnostic. Design anything from 3D prints, game assets, and more.

**[Try it now at tau.new](https://tau.new)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tau-desktop-dark.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/tau-desktop-light.webp">
  <img alt="Tau Desktop View" src="docs/assets/tau-desktop-light.webp">
</picture>

> 🚧 **Tau is currently under heavy development.** APIs and interfaces may change as we add new features and improvements.

## Features

- **Open Source** — Apache-2.0 across the complete Tau codebase (see [LICENSING.md](LICENSING.md))
- **Browser-Based** — Run CAD on mobile or desktop, no **installation** required
- **Code-Based CAD** — Precise, version-controlled designs through code
- **AI-Powered** — Natural language interface for design creation and modification
- **Parametric Editor** — Adjustable parameters with real-time preview
- **Multi-Kernel** — Choose the right CAD engine for your project
- **Embeddable** — Components to bring CAD into any web application

## Use Cases

- **3D Printing** — Design and export to STL, 3MF, and slicer-compatible formats
- **Game Development** — Create 3D models for games and simulations
- **Industrial Design** — Create 3D models for industrial design and manufacturing
- **CAD Prototyping** — Parametric code with version control and instant iteration
- **Academic Research** — Kernel APIs for computational geometry and educational tools

## Supported Integrations

Tau's multi-kernel architecture lets you choose the best engine for your needs. We're currently focused on mechanical CAD, with plans to expand into electrical design, firmware development, and simulation.

| Category       | Type | Implemented                                                                                                                                                                                                                                                                                                             | Planned                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mechanical** | CAD  | • [OpenRSCAD](./packages/plugins/openrscad)<br>• [Replicad](https://replicad.xyz/)<br>• [Manifold](https://github.com/elalish/manifold)<br>• [Zoo (KCL)](https://zoo.dev/)<br>• [JSCAD](https://openjscad.xyz/)<br>• [OpenCascade](https://ocjs.org/) (direct [`libcascade`](https://www.npmjs.com/package/libcascade)) | • [OnShape](https://www.onshape.com/)<br>• [Fusion360](https://www.autodesk.com/products/fusion-360)<br>• [Build123D](https://github.com/gumyr/build123d)<br>• [Curv](https://github.com/curv3d/curv)<br>• [PicoGK](https://github.com/leap71/PicoGK) ([ShapeKernel](https://github.com/leap71/LEAP71_ShapeKernel))<br>• [Buerli](https://buerli.io/) ([ClassCAD](https://classcad.ch/)) |
|                | Sim  | —                                                                                                                                                                                                                                                                                                                       | • [FEAScript](https://feascript.com/)                                                                                                                                                                                                                                                                                                                                                    |
| **Electrical** | CAD  | —                                                                                                                                                                                                                                                                                                                       | • [TSCircuit](https://tscircuit.com/)<br>• [Atopile](https://atopile.io/)                                                                                                                                                                                                                                                                                                                |
|                | Sim  | —                                                                                                                                                                                                                                                                                                                       | • [ngspice](https://ngspice.sourceforge.io/)<br>• [CircuitJS](https://www.falstad.com/circuit/)                                                                                                                                                                                                                                                                                          |
| **Firmware**   | CAD  | —                                                                                                                                                                                                                                                                                                                       | • [Arduino](https://www.arduino.cc/)<br>• [MicroPython](https://micropython.org/)                                                                                                                                                                                                                                                                                                        |
|                | Sim  | —                                                                                                                                                                                                                                                                                                                       | • [QEMU](https://www.qemu.org/)<br>• [Wokwi](https://wokwi.com/)                                                                                                                                                                                                                                                                                                                         |

## File Converter

Convert between **39 input formats** and **14 output formats** including STL, STEP, GLTF, FBX, 3MF, OBJ, USDZ, and more.

## Community

- **Discord** — [Join our community](https://discord.gg/6pfSAN3t7A)
- **Documentation** — [tau.new/docs](https://tau.new/docs)
- **GitHub Discussions** — Ask questions and share ideas

## Contributing

We welcome contributions! Please see our [Contributing Guide](contributing.md) for development setup and guidelines.

## Security

For security concerns, please review our [Security Policy](security.md).

## Code of Conduct

Please read our [Code of Conduct](code_of_conduct.md) before participating.

## Built With

Tau is built on a foundation of excellent open-source projects:

| Category             | Technologies                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State Management** | [XState V5](https://xstate.js.org/)                                                                                                                                       |
| **Code Editor**      | [Monaco Editor](https://microsoft.github.io/monaco-editor/)                                                                                                               |
| **3D Rendering**     | [Three.js](https://threejs.org/), [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)                                                                             |
| **UI Framework**     | [React 19](https://react.dev/), [Radix UI](https://www.radix-ui.com/), [shadcn/ui](https://ui.shadcn.com/)                                                                |
| **File Tree**        | [Headless Tree](https://headless-tree.lukasbach.com/)                                                                                                                     |
| **AI Orchestration** | [LangChain](https://js.langchain.com/)                                                                                                                                    |
| **3D Processing**    | [glTF-Transform](https://gltf-transform.dev/), [Assimp](https://assimp.org/)                                                                                              |
| **CAD Kernels**      | [OpenCascade.js](https://ocjs.org/), [Manifold](https://github.com/elalish/manifold), [JSCAD](https://openjscad.xyz/), [OpenRSCAD](https://github.com/matthova/openrscad) |
| **Documentation**    | [Fumadocs](https://fumadocs.dev/)                                                                                                                                         |
| **Database**         | [Drizzle ORM](https://orm.drizzle.team/)                                                                                                                                  |
| **Git Operations**   | [Isomorphic Git](https://isomorphic-git.org/)                                                                                                                             |

Special thanks to [OpenSCAD Playground](https://github.com/openscad/openscad-playground) for inspiring the browser-based code-CAD architecture.

## License

All Tau-authored code is **[Apache-2.0](license)**, including the applications, internal libraries, tools, examples,
published packages, and the GeoSpec engine. It may be forked, modified, embedded, hosted, and redistributed, including
commercially, subject to the Apache licence and notice requirements.

See **[LICENSING.md](LICENSING.md)** for repository-wide details, previous-release treatment, and third-party notices.

Full third-party license inventory: [license-deps](license-deps).
