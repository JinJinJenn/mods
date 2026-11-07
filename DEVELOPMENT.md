# Development handoff

## Source of truth

This package starts from the approved standalone homepage supplied as `JinJinJenn.html`. The publishing entry is `index.html`. Use the files under `source/` for ongoing editing and regenerate the entry with `tools/build.py`.

The published page is intentionally self-contained. It uses native HTML/CSS/JavaScript, system fonts, embedded lossless WebP artwork, and a small native WebGL renderer. There is no Node project, npm install, external engine, CDN, or runtime asset fetch.

## Page and layout

`source/page.template.html` contains the page structure, CSS, project data, accessible controls, and interaction code. The build replaces its asset-map and renderer placeholders.

The `siteShell` ResizeObserver classifies the available content width:

| Width | Layout |
| --- | --- |
| Below 700 px | Mobile: characters, welcome panel, and native mod collection stacked vertically. |
| 700–1099 px | Tablet: characters above the two illustrated panels. |
| 1100 px and above | Desktop: welcome, characters, and collection side by side. |

The generated illustration panels are preserved on desktop. Mobile collection rows use native text and inline SVG icons so names and statuses remain readable at narrow widths.

Artwork placement uses the manifest's meaningful alpha bounds (alpha at least 8). The original bitmap pixels are unchanged; CSS clips and positions the image inside its visible bounds. The unusually wide transparent margins around some source files are intentional.

The garden uses separate layer ordering: character cutouts at z-index 5, GPU canvas at 9, panels at 15, taskbar at 30, and header at 40. Keep `.garden-grid` at `z-index:auto`; making it a stacking context would put all of its children behind the GPU overlay and let particles cross panel text.

## Embedded assets

`source/assets-manifest.json` maps 20 stable asset IDs to their files, intrinsic dimensions, visible bounds, format, and encoded byte sizes. Asset file paths are relative to the package root.

All WebP files are lossless and match their generated PNG predecessors pixel for pixel, including alpha. No cropping or resizing was performed during conversion. If you replace an image, update its encoded byte count in the manifest, and update the dimensions and bounds if those changed. The builder reads the actual file and checks it against the manifest before embedding it.

Source assets are retained separately for future editing. `index.html` embeds its own complete copies and does not depend on the source folder at runtime.

## GPU renderer

`source/gpu-scene.js` exports `window.JinGardenGPU`.

The constructor accepts a canvas, the hero element, two persistent DOM anchor elements, a forced reduced-motion flag, and an `onState` callback. Methods are `setEnabled`, `setPaused`, `resize`, `destroy`, `burst`, and `setNight`. `burst(x,y)` takes client viewport coordinates.

Each jewel is a double-pyramid mesh with 16 flat-shaded triangles. Viewport and scissor mapping align each mesh with the corresponding DOM anchor. The renderer also draws small local halos and point-sprite fireflies. A frame with both jewels visible uses seven draw calls. The characters and scenery remain illustrated image layers.

| Setting | Desktop | Compact/touch |
| --- | --- | --- |
| Frame cap | 60 FPS | 30 FPS |
| Maximum device-pixel ratio | 1.5 | 1.25 |
| Ambient particles | 24 | 14 |

These are renderer limits, not measured hardware frame rates. Canvas buffers are also constrained to the available renderbuffer limit, up to 4096 pixels on either axis. Rendering suspends when hidden or offscreen, and reduced motion uses a static draw.

PNG-style painted jewel fallbacks remain in their DOM anchor boxes. The page hides their pixels when WebGL reports availability, while preserving the anchors' geometry. Unsupported WebGL or context loss restores the fallback. Context restoration recreates the renderer's GL resources.

Do not destroy and immediately reconstruct the renderer on the same canvas for preference changes or browser back/forward navigation. `destroy()` explicitly loses the GL context. The page preserves the instance across those events and uses pause/resize instead.

Debug renderer state is exposed as `window.__jinGPUStats`. The hero also exposes `data-renderer`, `data-gpu-available`, `data-gpu-reason`, and `data-gpu-error` for diagnostics.

## Local review routes

These optional query parameters are for layout review and do not alter the default page:

- `?width=390`, `?width=320`, and `?width=820` constrain the page's content width.
- `?gpu=0` forces the illustrated fallback.
- `?motion=off` forces reduced motion.
- Parameters can be combined, such as `?width=390&gpu=0`.

When using the optional local server, an example is `http://localhost:8000/?width=390&gpu=0`. Width-constrained browser views are not physical mobile-device or touch emulation.

The page sets `data-ready="true"` on the root element after its initial required artwork decodes. Theme and pause preferences are stored locally when browser storage is available.

## Review record

The approved baseline was inspected in a browser on desktop and at 820, 390, and 320 px content widths. There was no horizontal overflow. All seven project dialogs, About, Escape/focus restoration, mobile navigation, theme switching, motion controls, cat interaction, forced fallback, and forced reduced motion passed their checks.

The final source includes a mobile-specific 44 px taskbar target correction, a GPU stacking correction, and removal of unsupported outbound-arrow glyphs. These last small changes were source-verified after the shared preview changed to another workstream; they were not recaptured in the browser.

The preview browser reported `WebGL is unavailable.` The six original shader stages compiled and the three programs linked using installed surfaceless EGL/Mesa software graphics. That verifies compilation and link semantics, not hardware visual fidelity or measured phone performance.

For the next hardware pass, check jewel positioning and rotation, readable content and touch controls at the actual phone viewport, theme switching, pause/reduced motion, and navigation back to the page. Keep the illustrated fallback usable.

## Repository boundaries

The archive contains this homepage and its editable source. It does not contain the existing devlog, downloadable Sims mods, other website pages, or the earlier full PNG layer-kit ZIP. Preserve existing repository content when copying this package into the site's publishing folder.

The current external links point to `https://jinjinjenn.github.io/devlog/` and `https://github.com/JinJinJenn`. Update those in the template if the site is intentionally moved.
