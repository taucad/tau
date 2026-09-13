---
title: 'Agent Image Region Clipping Tool'
description: 'Research on adding an agent tool for clipping and zooming into attached images and canvas screenshots to improve CAD visual intent capture and verification.'
status: active
created: '2026-05-03'
updated: '2026-05-03'
category: architecture
related:
  - docs/research/agentic-cad-geometric-intent-preservation.md
  - docs/research/image-context-management-gap-analysis.md
  - docs/research/image-storage-architecture.md
  - docs/research/agent-screenshot-rpc-resize-audit.md
---

# Agent Image Region Clipping Tool

This document evaluates whether Tau should give the CAD agent a tool for clipping or zooming into specific regions of images that were attached by the user or captured from the canvas.

## Executive Summary

Research supports adding a region-clipping tool. Recent VQA and GUI-grounding work shows that multimodal models struggle with small visual concepts, dense screenshots, tiny labels, icons, and fine geometry, and that crop/zoom passes significantly improve detail-sensitive answers. For Tau, this maps directly to CAD-agent failures: missed bores, bolt counts, flange details, chamfers, color/material regions, and screenshot verification errors.

The recommended tool is not a replacement for full-image inspection. It should preserve the original image as global context, then return cropped supplemental evidence with coordinate provenance, padding, source image reference, and optional annotations. The first version should be a generic `clip_image_region` tool over stored image artifacts; later versions can add automated region proposals, Set-of-Mark overlays, and true viewer re-capture at a higher render resolution.

## Problem Statement

The companion research in `docs/research/agentic-cad-geometric-intent-preservation.md` found that visual references need feature extraction before modeling and that screenshots catch different failures than numeric checks. Tau can capture screenshots and accept user images, but the agent currently has to reason over whole images. Whole-image inspection is weak when the relevant detail is a small part of the frame: a tiny through-hole, one fastener pattern, a tab hidden near an edge, a reference-image label, or a particular orthographic view inside a composite screenshot.

The question for this investigation is: should Tau expose an image-region clipping tool so the agent can crop irrelevant pixels, inspect a feature at higher effective resolution, and use the cropped region as evidence for intent capture and verification?

## Methodology

Research combined local source review and external evidence:

| Evidence                           | Source                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| CAD-agent intent requirements      | `docs/research/agentic-cad-geometric-intent-preservation.md`                                            |
| Existing image context constraints | `docs/research/image-context-management-gap-analysis.md`, `docs/research/image-storage-architecture.md` |
| Existing screenshot tool           | `apps/api/app/api/tools/tools/tool-screenshot.ts`                                                       |
| Screenshot RPC schemas             | `libs/chat/src/schemas/rpc.schema.ts`, `libs/chat/src/schemas/tools/screenshot.tool.schema.ts`          |
| UI screenshot capture              | `apps/ui/app/hooks/rpc-handlers.ts`, `apps/ui/app/components/chat/capture-view-screenshot.utils.ts`     |
| Screenshot UI rendering            | `apps/ui/app/routes/projects_.$id/chat-message-tool-screenshot.tsx`                                     |
| External research                  | ViCrop, CropVLM, Zoom-Refine, Set-of-Mark, ScreenSpot-Pro, UI-Zoomer, ZoomClick, OpenAI vision guidance |

## Findings

### Finding 1: Cropping directly targets a known VLM weakness: small detail perception

Visual question answering research consistently finds that multimodal models degrade when the answer depends on small regions. ViCrop reports that zero-shot accuracy can decline up to roughly 46% as the visual subject gets smaller, and that human crops substantially mitigate the size sensitivity. The same work reports large gains on detail-focused datasets such as TextVQA and FDVQA, with automatic crops approximating some of the human-crop benefit.

CropVLM and Zoom-Refine reinforce the same pattern: use a first pass to identify a task-relevant region, crop the original high-resolution source, then feed the crop back as finer-grained context. This works without modifying the target VLM and is especially useful for high-resolution or out-of-domain images.

Tau's CAD use case is detail-sensitive by default:

| CAD visual task                              | Why full image is weak                         | Why crop helps                                                    |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Count bolts on a flange                      | Bolts occupy a small ring of pixels            | Crop isolates the ring and enlarges each bolt                     |
| Verify a bore passes through an eyelet       | Hole may be dark, small, or partially occluded | Crop removes unrelated body geometry and preserves local contrast |
| Compare chamfer/fillet presence              | Edge treatment is visually subtle              | Crop focuses on the edge silhouette                               |
| Inspect a reference-image label or dimension | Text is often tiny after resize                | Crop preserves readable pixels and reduces OCR distractions       |
| Verify one panel of a multi-angle composite  | Six views share one image budget               | Crop isolates the relevant view                                   |

### Finding 2: Crops should supplement the original, not replace it

Cropping can harm tasks that need global context. ViCrop notes that localization and counting questions can become harder if the crop removes important surrounding information. For CAD, a crop of a clevis eye can reveal the bore but hide whether the bore is coaxial with the rod. A crop of a flange can improve bolt counting but hide whether the flange is on the correct face.

The tool should therefore return crops as supplemental evidence:

- Keep the original image in the conversation or artifact store.
- Include crop metadata: source image reference, source dimensions, normalized bounding box, pixel bounding box, padding, scale factor.
- Encourage the agent to state whether a claim came from the full image, a crop, or both.
- Allow multiple crops for distributed evidence rather than forcing one crop to answer everything.

### Finding 3: GUI-grounding research maps well to Tau canvas screenshots

Computer-use and GUI-grounding research is relevant because Tau screenshots are dense, high-resolution visual workspaces. ScreenSpot-Pro shows that professional high-resolution GUIs contain small target elements and complex layouts; existing models perform poorly, while strategically reducing search area improves accuracy. ScreenSeekeR improves grounding by progressively narrowing regions. UI-Zoomer and ZoomClick show adaptive zoom/crop passes improve dense UI localization, especially for icons and small targets.

Tau's canvas screenshots have the same structural problem:

- Multi-angle screenshots place several views into one composite.
- Viewer controls, backgrounds, axes, and empty space consume pixels.
- Important geometry can occupy a small fraction of the rendered image.
- A model can confuse "global silhouette" with a local feature because the screenshot contains too much unrelated visual context.

For canvas verification, clipping can let the agent inspect "the front-view lower-left flange" or "the rod-barrel interface" without re-sending the entire screenshot at high detail.

### Finding 4: Provider guidance supports crop-and-rerun workflows

OpenAI vision guidance recommends higher image detail or original resolution when text is tiny, labels are low-contrast, or screenshots contain fine details. It also recommends using tools such as code interpreter for multi-pass inspection, zooming, cropping, rotating, and bounding-box localization. When such tools are unavailable, a narrow crop-and-rerun pipeline is recommended: localize, crop locally, then run a focused extraction prompt.

This supports a Tau-native tool instead of relying on implicit provider behavior. Provider high-detail modes spend image budget across tiles. A crop lets Tau spend detail budget on the region that matters, keeps prompts provider-agnostic, and gives deterministic provenance for what the model inspected.

### Finding 5: Current Tau screenshots are image outputs, not addressable image artifacts

The current screenshot tool returns images as data URLs:

- `tool-screenshot.ts` sends RPC requests and returns `{ images: [{ view, dataUrl }] }`.
- `screenshot.tool.schema.ts` defines `view` and `dataUrl`; there is no stable image ID, width, height, or provenance field.
- `captureScreenshotRpc` returns `images: [{ view, dataUrl }]`.
- `captureObservationsRpc` returns observation images through a separate schema.
- The UI renders screenshot data URLs inline in `chat-message-tool-screenshot.tsx`.

This means a cropping tool cannot yet cleanly say "crop screenshot `toolu_123`, image `front`, region `[100, 210, 480, 560]`" unless Tau adds an image reference layer or accepts raw data URLs as tool input. Passing raw data URLs into a tool is possible but undesirable: it repeats the base64-in-context problem already documented in image-storage research.

### Finding 6: Region clipping is easiest after image storage references exist, but can start with tool-result references

`docs/research/image-storage-architecture.md` recommends content-addressable image references. A clipping tool becomes much cleaner once images are stored by hash:

```typescript
type ImageRegion = {
  imageRef: string; // content hash, screenshot artifact ID, or tool image ref
  box: {
    x: number; // normalized 0..1000
    y: number;
    width: number;
    height: number;
  };
  padding?: number;
};
```

However, implementation does not need to wait for the full storage migration. A useful first version can reference recent tool images by structured identity:

| Source                 | Possible reference                                         |
| ---------------------- | ---------------------------------------------------------- |
| Screenshot tool result | `{ kind: 'toolImage', toolCallId, view }`                  |
| User-attached image    | `{ kind: 'messageImage', messageId, partIndex }`           |
| Future image store     | `{ kind: 'imageHash', hash }`                              |
| Canvas viewer          | `{ kind: 'viewer', targetFile, view }` for re-capture/crop |

The tool should not accept arbitrary base64 as the primary input once stable references exist.

### Finding 7: For canvas captures, crop is not the same as true zoomed re-render

Cropping an existing screenshot only enlarges pixels already captured. If the original screenshot used `maxResolution: 800` or a six-view composite, a crop may still lack detail. A true viewer zoom/re-capture can render the model again with a tighter camera framing or higher max resolution.

Recommended split:

| Capability                        | Purpose                                                                          | Implementation                                                               |
| --------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `clip_image_region`               | Crop any existing image: user uploads, reference images, screenshot tool outputs | Canvas/ImageBitmap crop from stored bytes                                    |
| `capture_screenshot` crop options | Capture a viewer screenshot with region/camera intent                            | Extend screenshot RPC with view, resolution, zoom, maybe target bounding box |
| Future `inspect_view_region`      | Agent asks for a feature-focused re-render from geometry/camera state            | Viewer computes camera framing or uses object-space target                   |

Start with `clip_image_region` because it is generic and low risk. Add true re-render only after crop usage shows which canvas regions need more detail.

### Finding 8: Automated region proposal is useful later, but agent-directed cropping should come first

Set-of-Mark prompting and VIPACT-style vision expert tools show that segmentation, object detection, and marked regions improve visual grounding. Set-of-Mark overlays speakable labels on segmented regions, allowing an LMM to say "region 12" instead of producing brittle coordinates. This is attractive for Tau because CAD screenshots contain meaningful visual parts, and reference images often include repeated components.

But the first tool should be deterministic and simple:

1. Agent inspects full image.
2. Agent chooses a normalized region.
3. Tool returns the crop and metadata.
4. Agent verifies a specific intent element against the crop.

Automated proposals can come later:

- `mark_image_regions` to return a Set-of-Mark overlay.
- `propose_image_regions` to suggest likely holes, fasteners, text labels, or high-detail regions.
- `clip_image_region` remains the primitive that executes the crop.

### Finding 9: Cropping has real costs and failure modes

Region clipping is beneficial, but not free:

| Risk                              | Impact                                                     | Mitigation                                                                                |
| --------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Coordinate mistakes               | Agent crops the wrong area and reaches false conclusions   | Use normalized coordinates plus rendered overlay previews; include source/crop metadata   |
| Context loss                      | Crop hides relationships needed for correct interpretation | Always keep source image available; require crop claims to cite full/crop evidence        |
| Extra tool calls                  | More latency and chat clutter                              | Make crops targeted; avoid automatic crop loops in the first version                      |
| Storage duplication               | Crops create more images                                   | Store crops content-addressably; record parent reference rather than duplicating metadata |
| Provider token growth             | Sending original plus many crops can exceed image budgets  | Enforce crop count and size caps; use crops only for specific questions                   |
| Pixel interpolation hallucination | Upscaled crops may look sharper without adding information | Crop original bytes, do not upscale by default; report source and crop pixel dimensions   |
| Privacy/security                  | Crops may expose sensitive image regions more prominently  | Treat crops as derived artifacts with same access controls as source images               |

### Finding 10: The highest-value CAD workflow is feature-led visual verification

The tool should be framed around a specific workflow rather than generic image editing:

1. Capture or receive full image.
2. Name the feature under inspection: "left clevis bore", "front flange bolt ring", "top-view slot".
3. Crop the feature with enough padding to preserve local context.
4. Ask a focused visual question: "Does this crop show 12 evenly spaced bolts?" or "Is the bore visible and centered?"
5. Translate the result into source edits, tests, or screenshot-inspection notes.

This directly strengthens the intent-preservation loop. The crop is evidence for one intent element, not a new source of open-ended visual speculation.

## Recommendations

| #   | Action                                                                                       | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add a generic `clip_image_region` tool for existing image artifacts                          | P0       | Medium | High   |
| R2  | Use normalized 0..1000 coordinates plus source pixel metadata for all crop boxes             | P0       | Low    | High   |
| R3  | Return crop provenance: source ref, view, original dimensions, box, padding, crop dimensions | P0       | Low    | High   |
| R4  | Do not accept raw base64 as the long-term tool input; use image refs/tool image refs         | P0       | Medium | High   |
| R5  | Update screenshot outputs to include stable image refs and dimensions                        | P1       | Medium | High   |
| R6  | Add prompt guidance: use crops only for named feature checks and keep full-image context     | P1       | Low    | Medium |
| R7  | Add crop count/size budgets tied to image context-management policy                          | P1       | Low    | Medium |
| R8  | Later: add Set-of-Mark overlays or automated region proposals for dense images               | P2       | Medium | Medium |
| R9  | Later: add viewer re-capture/true zoom for canvas regions where pixel crop is insufficient   | P2       | High   | High   |

## Proposed Tool Contract

### Tool Name

`clip_image_region`

### When To Use

Use when the agent needs to inspect a specific visual feature from an existing image more clearly:

- A small detail in a user-attached reference image.
- One view inside a multi-angle screenshot.
- A local CAD feature such as a bore, fastener pattern, slot, edge treatment, label, or material region.
- A visual discrepancy identified during screenshot verification.

When not to use:

- Do not crop before first inspecting the full image.
- Do not crop when a numeric geometry query can answer the question more reliably.
- Do not use repeated blind crops; each crop should name the feature being checked.
- Do not use pixel crop when a true re-render is required to reveal missing detail.

### Input Shape

```typescript
type ClipImageRegionInput = {
  source:
    | { kind: 'toolImage'; toolCallId: string; view?: string; index?: number }
    | { kind: 'messageImage'; messageId: string; partIndex: number }
    | { kind: 'imageHash'; hash: string };
  region: {
    x: number; // 0..1000, left
    y: number; // 0..1000, top
    width: number; // 1..1000
    height: number; // 1..1000
  };
  padding?: number; // 0..200 normalized units
  purpose: string;
};
```

### Output Shape

```typescript
type ClipImageRegionOutput = {
  image: {
    dataUrl: string;
    width: number;
    height: number;
    mediaType: 'image/webp' | 'image/png' | 'image/jpeg';
  };
  source: {
    ref: string;
    width: number;
    height: number;
    region: { x: number; y: number; width: number; height: number };
    pixelRegion: { x: number; y: number; width: number; height: number };
    padding: number;
  };
  purpose: string;
};
```

The `purpose` field is important. It forces the agent to bind the crop to an intent element rather than using crops as exploratory clutter.

## Target Architecture

```text
User image or screenshot tool result
             |
             v
Image artifact store
- content hash or tool image ref
- dimensions/media type
- parent/provenance metadata
             |
             v
clip_image_region(imageRef, normalizedBox, purpose)
             |
             v
Derived crop artifact
- data URL for immediate model use
- parent ref + pixel box
- bounded dimensions/byte size
             |
             v
Focused visual verification
- "crop confirms 12 bolts"
- "crop shows bore is missing"
- "crop text says 6 mm"
             |
             v
CAD source edit / test requirement / screenshot note
```

## Implementation Notes

### Short-Term Version

- Add a tool schema under `libs/chat/src/schemas/tools/`.
- Add an API tool that sends an RPC to the UI or resolves server-side stored image bytes when available.
- Add a UI RPC handler that can resolve recent screenshot/user image refs and crop using Canvas or `createImageBitmap`.
- Return WebP by default, with bounded dimensions and quality.
- Add tests for coordinate conversion, padding clamp, invalid refs, and byte-size cap.

### Dependency on Image Storage

The best implementation depends on image references. Without references, the crop tool would need to pass base64 around, which conflicts with `image-storage-architecture.md`. A pragmatic first version can support `toolImage` references for screenshot outputs and later add `imageHash`.

### Coordinate Contract

Use normalized `0..1000` coordinates, top-left origin. This mirrors external vision guidance and avoids coupling the agent to source pixel dimensions. The output should echo exact pixel bounds so debugging is possible.

### Cropping Policy

- Minimum crop size: reject tiny boxes that produce unusable crops.
- Maximum crop count per turn: start with a small budget, e.g. 3-5 crops.
- Maximum output dimension: cap similarly to existing screenshot/image resize rules.
- Padding default: include 5-10% around the target to avoid context loss.
- No default upscaling: if the crop is too small, report that a higher-resolution re-capture is needed.

## Verdict

Tau should add image-region clipping as a first-class agent capability. The evidence is strong that crops improve detail-sensitive visual reasoning, and CAD visual intent is full of detail-sensitive tasks. The best design is a provenance-preserving crop tool over stored image artifacts, not an image-editing toy and not a base64-heavy workaround.

The tool should be introduced as part of the CAD visual verification loop: full image first, crop a named feature second, then convert the observation into source structure, a deterministic test, or a screenshot-inspection target. This directly complements `docs/research/agentic-cad-geometric-intent-preservation.md`.

## References

- Related: `docs/research/agentic-cad-geometric-intent-preservation.md`
- Related: `docs/research/image-context-management-gap-analysis.md`
- Related: `docs/research/image-storage-architecture.md`
- Related: `docs/research/agent-screenshot-rpc-resize-audit.md`
- ViCrop: [Perceiving Small Visual Details in Zero-shot Visual Question Answering with Multimodal Large Language Models](https://arxiv.org/html/2310.16033v2)
- CropVLM: [Learning to Zoom for Fine-Grained Vision-Language Perception](https://arxiv.org/abs/2511.19820)
- Zoom-Refine: [Localized Zoom and Self-Refinement for high-resolution MLLM understanding](https://arxiv.org/pdf/2506.01663)
- Set-of-Mark: [Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V](https://arxiv.org/abs/2310.11441)
- ScreenSpot-Pro: [GUI Grounding for Professional High-Resolution Computer Use](https://arxiv.org/html/2504.07981v1)
- UI-Zoomer: [Uncertainty-Driven Adaptive Zoom-In for GUI Grounding](https://arxiv.org/html/2604.14113v1)
- ZoomClick: [Zoom in, Click out: Unlocking and Evaluating the Potential of Zooming for GUI Grounding](https://arxiv.org/html/2512.05941v1)
- OpenAI cookbook: [Vision and document understanding tips](https://developers.openai.com/cookbook/examples/multimodal/document_and_multimodal_understanding_tips)
