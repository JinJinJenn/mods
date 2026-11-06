# JinJinJenn Mods

A development repository for Jenn's cozy Sims 4 mod portfolio, built around an illustrated garden, retro desktop windows, and stickerbook artwork. The page includes mobile and tablet layouts, project dialogs, a moonlit theme, a sleeping cat, and optional WebGL jewels and particles.

**Status: development preview. GitHub Pages publishing setup is pending verification.**

The project belongs in [JinJinJenn/mods](https://github.com/JinJinJenn/mods). The existing profile/main website and the town project remain separate. A future profile replacement is still future work and needs its own explicit decision.

## Start here

**The development preview is already built. Open `index.html` in a browser to view it.** Its artwork, CSS, JavaScript, and shaders are all embedded, so there is nothing to install before viewing it.

The initial `index.html` is the exact `JinJinJenn.html` approved on 6 November 2026, renamed to the conventional HTML entry filename. The repository also includes editable source files and a reproducible rebuild script.

## Work in this repository

1. Clone or download `JinJinJenn/mods` to a local folder.
2. Open the included `index.html` to review the current design.
3. Make changes in `source/`, rebuild, and check the result using the instructions below.
4. Commit the updated source, generated `index.html`, and relevant documentation to this development repository.

Commit development work to this repository. Once the intended Pages source is configured, updates to `main` will publish the project preview. This project remains separate from the existing profile/main website.

## GitHub Pages development preview

Publishing setup is **pending verification**. The expected preview address is [https://jinjinjenn.github.io/mods/](https://jinjinjenn.github.io/mods/); it has not yet been verified as live. The intended publishing source is the `main` branch and the repository root (`/(root)`).

For the intended branch-based setup:

1. Open **Settings → Pages** in `JinJinJenn/mods`.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select `main` and `/(root)`, then save.
4. Wait for the Pages deployment to complete and verify the preview address.

The root `index.html` is already built and contains every required resource. The included `.nojekyll` file marks it as a prebuilt static site; the marker itself does not enable hosting.

Pages hookup has been requested for this mods-site development preview. Any move into the profile/main website still requires a separate migration plan and approval. The town project remains separate.

The page's existing buttons still lead to [Jenn's Devlog](https://jinjinjenn.github.io/devlog/) and [GitHub profile](https://github.com/JinJinJenn). Those destinations have been preserved from the approved page.

## Repository contents

| File or folder | Purpose |
| --- | --- |
| `index.html` | Complete development preview with all resources embedded. |
| `.nojekyll` | Prebuilt-site marker for the intended Pages publishing setup. |
| `README.md` | Development scope, preview, and rebuild instructions. |
| `DEVELOPMENT.md` | Code structure, rendering details, and verification notes. |
| `source/page.template.html` | Editable page structure, styles, content, and interaction code. |
| `source/gpu-scene.js` | The standalone WebGL renderer. |
| `source/assets/` | All 20 lossless WebP artwork files. |
| `source/assets-manifest.json` | Asset filenames, dimensions, and placement bounds. |
| `tools/build.py` | Python script that embeds the source into `index.html`. |
| `.gitignore`, `.gitattributes` | Repository housekeeping and text-file line endings. |
| `CHECKSUMS.sha256` | SHA-256 hashes for this development baseline. |

The source folder is for editing and backup. The browser does not load resources from it when displaying `index.html`.

## View locally

Double-click `index.html`, or choose **Open file** in your browser. The page and project dialogs work offline. Opening the external Devlog or GitHub links needs an internet connection.

If you prefer an HTTP preview and already have Python installed, open a terminal in this folder and run `python -m http.server 8000`, then visit `http://localhost:8000`. On Windows, `py -m http.server 8000` is an equivalent launcher. Stop the server with Ctrl+C.

## Make changes and rebuild

Python 3 is needed only for rebuilding after source changes. The builder uses the standard library and has no package dependencies.

1. Edit `source/page.template.html` for layout, content, links, CSS, and dialog behavior.
2. Edit `source/gpu-scene.js` for the 3D jewels, particles, and renderer settings.
3. Run `python tools/build.py` from this folder. On Windows you can use `py tools/build.py`.
4. Open the regenerated `index.html` and check it, then commit the updated source and `index.html` to `JinJinJenn/mods`.

Run `python tools/build.py --check` to check whether the current `index.html` matches the source without overwriting it. The builder also works when called from another directory using its full path.

The builder only generates the local HTML file. It does not commit, push, publish, or change repository settings. After intentional file changes, refresh `CHECKSUMS.sha256` when recording a new verified baseline; it is separate from the source-to-HTML check.

Keep the `__ASSET_MAP__` and `__GPU_SOURCE__` placeholders in the template; the builder replaces them. Asset keys and DOM hooks connect the artwork to its layout and controls.

The welcome panel and desktop mod panel contain illustrated lettering. Their visible baked text changes only when the corresponding artwork changes. The mobile collection, project dialogs, accessible labels, and other native text are editable in the template. Keep status changes consistent across these surfaces.

## What is included

- The garden background and 19 transparent overlays, including foliage, characters, logo, panels, buttons, jewels, taskbar, and cat.
- Desktop composition, tablet arrangement, and a stacked phone layout with readable mod rows.
- Details for MoveAnywhere, Love Notes, Surprise Gifts, Thinking of You, Toasts, Gentle Hearts, and Toddler TV.
- Sunset/moonlit garden toggle, pause/resume control, reduced-motion support, keyboard-accessible dialogs, and the cat interaction.
- Two genuine 3D jewels and lightweight particles when WebGL is available, with illustrated fallback jewels otherwise.

No mod downloads are bundled or advertised as released. The current statuses remain **In testing** or **In the workshop**.

## Size and verification

The homepage is 23,533,715 bytes (22.44 MiB). All 20 images use lossless WebP conversion and retain the original PNG pixels and alpha values. A phone downloads the complete embedded file even though its layout is different.

The baseline was checked at desktop, 820 px tablet, and 390/320 px mobile layout widths. Project dialogs, Escape/focus restoration, navigation, theme switching, motion controls, and cat interaction were checked. The preview browser could not create a WebGL context, so it verified the illustrated fallback. All six shader stages and all three GPU programs separately compiled and linked in an offline graphics context. Actual browser GPU appearance and phone frame rates still need a hardware check.

The original approved homepage SHA-256 is `0364b9948dc46f084f13b2b439a77ae588492e4d8bed76e88f376e1e6595255c`.

Not affiliated with EA or Maxis.
