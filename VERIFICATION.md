# Launchpad Studio release verification

This report describes the original release candidate. See [roadmap status](ROADMAP_STATUS.md#verification-boundary) for verification of the newer roadmap branch.

## Game production scope

| Stage | Reference and scope |
| --- | --- |
| A. Art direction | Use the Woodland Relic and Orbital Vault gallery templates as the existing references. Preserve the sprite palette, first-person fog and geometry, and HUD readability. |
| B. Assets | Reuse the checked-in sprite, background and clip library. Offline packaging uses the same local assets. |
| C. Animation and VFX | Check continuous first-person motion and look, the rotating collectible, and the 2D turn-by-turn board. Verify collision, pickup, timeout, restart and completion feedback. |
| D. Presentation | Sequence the existing play surface from start to movement, item pickup and win or loss. The levels use HUD feedback and have silent audio by design. |
| E. Integration | Run the same engines through the editor, published snapshot and standalone HTML. |
| F. Visual QA | Windows desktop Chromium 148, ANGLE SwiftShader, 1440 × 1000 at DPR 1. Target 60 FPS with average ≥ 55 and p95 frame time ≤ 22 ms over 60 seconds of representative play. Check touch input separately in an emulated touch context. |

The default 100-point scoring weights apply. Game audio is silent by design, so audio review covers silence throughout the loop. Browser video exports are intentionally silent as well.


## Build and lifecycle audit

`worker/build.py` walks `dist/`, excludes `dist/server/`, and maps each eligible file to its URL path and MIME type. It stores text directly and base64-encodes PNG, JPEG and MP4 bytes. It aliases `/` to `/index.html` and writes the table before `worker/index.mjs` in the generated bundle. The Worker dispatches `/api/ai` before static asset routing and serves MP4 byte ranges from the bundled bytes.

| Type | Live editor | Saved draft | Published snapshot | Standalone file |
| --- | --- | --- | --- | --- |
| Website | Sandboxed HTML with page navigation | Template fields, pages, blocks and links | Validated UTF-8 snapshot in the URL fragment and sandboxed HTML | Shared renderer and embedded library images |
| Mobile web app | Sandboxed responsive HTML with interactive blocks | Same page data and block definitions | Same renderer, with scoped browser checklist storage through the parent | Shared renderer, embedded images and browser-local checklist state where available |
| 2D game | Canvas sprites and grid-based movement | Tile map, asset IDs, background and timer | Same Canvas engine using the frozen map | Inline engine, styles, map and sprite data |
| 3D game | WebGL world, continuous input, swept collision and depth test | Tile map, background, timer and wall height | Same WebGL engine using the frozen map | Inline shaders, engine, styles, map and assets |
| Video | Canvas timeline with a shared clip renderer | Scene order, trims, overlays, layouts, format and transitions | Same player, with clips served through Worker byte ranges | Offline HTML with embedded media and player, or a silent native browser recording |

`localStorage` holds draft data and the capped conversation. Publish selects known fields at each nesting level before encoding the snapshot. HTML exports use the project renderers directly. Both Demo and GPT construct proposals for review. Apply writes the proposed draft and refreshes the preview, while Dismiss clears the proposal. GPT POST validates the request and calls the Responses API with a deadline and `store:false`.


## Files changed

| Area | Files |
| --- | --- |
| Page editor, draft loading, snapshot filtering and standalone download | `dist/app.js`, `dist/pages.js`, `dist/blocks.js` |
| AI proposal state and Worker request handling | `dist/ai.js`, `worker/index.mjs` |
| WebGL movement, collision, fallback and render scheduling | `dist/game-3d.js` |
| Video renderer, recording and standalone playback | `dist/video.js`, `dist/video-play.css`, `dist/index.html`, `dist/style.css` |
| Local Worker, test runner and coverage | `worker/dev.mjs`, `package.json`, `package-lock.json`, `playwright.config.mjs`, `tests/browser-server.mjs`, `tests/worker.test.mjs`, `tests/studio.spec.mjs` |
| Documentation and generated-file rules | `README.md`, `SPECIFICATION.md`, `VERIFICATION.md`, `.gitignore` |

The 2D Canvas engine passed through its existing implementation. Its new regression coverage exercises wall blocking, timer expiry, traps, keyboard movement, touch movement and completion. The generated deployment bundle is `dist/server/index.js`.


## Browser test design

The browser suite runs headless Chromium with ANGLE SwiftShader. It rejects console errors, console warnings, page exceptions, and failed network requests. It also checks the linked WebGL program and depth buffer directly. Deliberate cancellation of a browser-local blob read during recording cleanup is expected.

The long-run benchmark uses the same renderer and game logic while removing Chromium’s host refresh pacing for the benchmark alone. The Windows 11 build 26300 host uses an Intel Core i7-1165G7 and a 40 Hz display. The viewport is 1440 × 1000 CSS pixels at DPR 1. The FPS measurement represents completed render-loop submissions, and the touch tests use real browser touch events in a 390 × 844 emulated viewport.

Video export sends timestamped canvas frames to a native recording track where supported and uses canvas stream capture otherwise. It verifies the resulting container duration before download and can retry with WebM when MP4 fails. The dedicated stress run repeated both recording paths twice. [Chrome media track documentation](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing)


## Verified release candidate

- The Python build exited **0** under WSL and generated the 1,145,372-byte `dist/server/index.js`. SHA-256 is `b95da1e6212f134e7b084dc16f889d7b1431986db7ccedac3ba1e28c7d790971`.
- **5/5 unit and Worker integration tests** and **13/13 Chromium tests** passed. Chromium completed in 147.1 seconds with zero retries or skips. Both native recording paths also passed two consecutive stress runs. [Complete Chromium results](test-results/verified/run.json)
- All five project types went through edit, reload from My projects, publish, and standalone `file://` playback with zero HTTP(S) requests from the standalone files. Website and mobile tests covered 12-page limits, navigation reference cleanup, independent interactive blocks, responsive layout and legacy single-page data. [Website](test-results/verified/studio-website-page-naviga-1464b-t-snapshot-and-offline-HTML-browser/pages.html) · [Mobile app](test-results/verified/studio-mobile-app-interact-06de7-ished-view-and-offline-HTML-browser/field-notes.html) · [2D game](test-results/verified/studio-Touch-enabled-edito-e75ff-d-touch-across-all-surfaces-browser/board-run.html) · [3D game](test-results/verified/studio-3D-real-WebGL-depth-6380f-editor-snapshot-and-offline-browser/vault-run.html) · [Video](test-results/verified/studio-video-timeline-trim-1bdce-P4-and-exports-offline-HTML-browser/trimmed-reel.html)
- The 2D level was completed with both keyboard and touch on each surface. The 3D level passed wall blocking, pickup and gate completion on each surface. Browser diagnostics included successful shader linking, a depth buffer with at least 16 bits and zero WebGL errors. The checks also covered wall height, mouse look, touch look, hold-to-move and WebGL fallback. [2D capture](test-results/verified/studio-Touch-enabled-edito-e75ff-d-touch-across-all-surfaces-browser/2d-playthrough.webm) · [3D capture](test-results/verified/studio-3D-real-WebGL-depth-6380f-editor-snapshot-and-offline-browser/3d-playthrough.webm) · [2D win screenshot](test-results/verified/studio-Touch-enabled-edito-e75ff-d-touch-across-all-surfaces-browser/2d-win.png) · [3D win screenshot](test-results/verified/studio-3D-real-WebGL-depth-6380f-editor-snapshot-and-offline-browser/3d-win.png)
- The 3D benchmark measured **55.23 FPS**, a **19.10 ms p95**, a **26.00 ms maximum frame interval** and **zero stalls above 50 ms** over 60.018 seconds and 3,315 intervals. The ANGLE SwiftShader drawing buffer was 482 × 301. [Representative 3D frame](test-results/verified/studio-3D-renders-a-full-6-c6601-ve-SwiftShader-play-session-performance/3d-orbit-reference.png)
- Chromium played and sought the silent **720 × 720 H.264 MP4** with a duration of **3.301633 s** and size of **868,187 bytes**, and the silent **960 × 540 VP8 WebM** with a duration of **3.260607 s** and size of **15,161 bytes**. Both sought to 1.25 s. Chromium sampled frame brightness across the MP4 fades, and FFmpeg decoded both exports in full and confirmed zero audio streams. [MP4](test-results/verified/studio-video-timeline-trim-1bdce-P4-and-exports-offline-HTML-browser/trimmed-reel.mp4) · [WebM](test-results/verified/studio-video-WebM-fallback-c2de5-on-stops-all-capture-tracks-browser/webm-fallback.webm) · [Video preview](test-results/verified/studio-video-timeline-trim-1bdce-P4-and-exports-offline-HTML-browser/video-preview.png)
- Demo and GPT fixture follow-ups passed Dismiss, Apply, persisted chat and publication privacy. The game HUD updated only after approval. Decoding the share payload and reading the standalone HTML confirmed chat exclusion, including nested draft-only data. The local environment had no `OPENAI_API_KEY`, so GPT verification used a deterministic Responses API fixture. The deployment artifact was verified against the local Worker.

### Game presentation review

| Area | Score | Evidence |
| --- | ---: | --- |
| Art | 20/25 | Existing sprite palette and 3D materials are legible in the saved playthroughs and screenshots. |
| Animation | 16/20 | 2D movement advances cleanly by tile. 3D shows continuous motion and stops at walls and on completion. |
| VFX | 16/20 | The visible collectible, pickup count and win or loss messages communicate the change in level state. |
| Cinematic and presentation | 12/15 | Fixed board framing and first-person camera transitions match the established game formats. |
| Audio | 10/10 | This scope uses silent gameplay and silent media exports. Captures and exports decoded with zero audio streams. |
| Performance | 8/10 | The software-rendered Chromium session met the declared average and p95 limits. |
| **Total** | **82/100** | Local game presentation and performance acceptance passed within the recorded environment. |

