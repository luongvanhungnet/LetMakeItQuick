# Launchpad Studio Product Specification

**Status:** Deployed with private Site access

**Repository:** [LetMakeItQuick](https://github.com/luongvanhungnet/LetMakeItQuick)

**Application:** [Launchpad Studio](https://launchpad-studio.luongvanhungnet.chatgpt.site)

## Purpose

Launchpad Studio is a browser-based editor for creating websites, mobile web apps, 2D games, first-person 3D games, and short videos. Creators can start from a template or a blank project, customize it with reusable assets, preview changes as they work, and share a snapshot or downloadable file.

## Project types

| Project type | Editor and preview | Output |
| --- | --- | --- |
| Website | Drag and arrange blocks, create named pages, and link buttons to internal pages or external HTTPS URLs. Switch between desktop and mobile preview widths. | Published snapshot or standalone HTML |
| Mobile web app | Use the page and block editor with a mobile preview. Add interactive blocks such as checklists, counters, and accordions. | Published snapshot or standalone HTML that runs in a browser |
| 2D game | Place characters, walls, collectibles, enemies, traps, and gates on a grid. Set an optional timer and playtest with keyboard or on-screen controls. | Published playable snapshot or standalone HTML |
| 3D game | Build a grid-based level, adjust wall height, and playtest in first person. Players can move continuously, look around, collide with walls, collect items, and reach the exit. | Published playable snapshot or standalone HTML. Playback requires WebGL. |
| Video | Arrange scenes on a timeline, trim built-in clips, add images, edit titles and captions, and select cuts or fades. Choose landscape, square, or portrait. | Published playback snapshot, standalone HTML with embedded media, or silent MP4/WebM depending on browser support |

## Core workflows

### Create, edit, and preview

1. Choose a template or start a blank project.
2. Edit the project using its page, block, level, or timeline controls.
3. Reuse images, sprites, backgrounds, and built-in clips from the asset library where the editor supports them.
4. Preview changes while editing. The preview appears to the right on wider screens and below the editor on narrow screens.
5. Reopen drafts from **My projects** in the browser where they were created.

### Connect website and app pages

A website or app starts with **Home** and supports up to 12 pages in total. Each additional page has its own content and blocks. Creators can add, rename, and remove additional pages. The published navigation menu lists all pages.

Use **Page content → Main button opens** to set the template button’s destination. For a **Link button** block, use **Open page** for an internal destination or enter an HTTPS URL for an external destination. Removing a page clears any internal button destinations that pointed to it.

### Edit with AI chat

Open **AI chat** in an existing project, describe a change, and ask follow-up questions in the same conversation. The assistant can propose edits to page copy and blocks, game settings and tiles, or video scenes. Review the proposal and choose **Apply changes** or **Dismiss**. Applying a proposal updates the draft and its live preview.

The browser stores chat history with the draft and excludes it from published snapshots. **Demo** uses built-in rules and works without a key. **GPT** sends the prompt, recent conversation, and relevant project content to the OpenAI Responses API. The server requires an `OPENAI_API_KEY` secret.

### Publish and share

**Publish** creates a link to a snapshot of the current project. Publish again to share later edits. The Site’s private access policy applies to those links. Recipients can open downloaded HTML or video files directly.

## Technical design

- The HTML, CSS, JavaScript, and bundled assets live in `dist/`. The project-specific renderers power live preview and published playback.
- The OpenAI Sites Worker serves the application, static assets, and `/api/ai`. It serves video clips with byte-range requests for seeking.
- Run `python3 worker/build.py` from the repository root to generate `dist/server/index.js` from the Worker source and static assets.
- Drafts and chat history use browser local storage. Snapshot links encode the published project state. Drafts do not sync across devices.
- The 2D game and video renderers use Canvas. The first-person 3D game uses WebGL with depth testing. Video export uses the browser’s canvas capture and recording APIs.
- Keep the OpenAI API key in the hosting environment as a server-side secret.

## Acceptance criteria

- A creator can start, edit, save, and reopen each supported project type.
- A configured internal button opens the destination page in live preview, published playback, and downloaded HTML.
- A 2D or 3D level can be played through collecting an item and reaching the exit. In 3D mode, walls block movement.
- A video timeline plays scenes in order, respects clip trims, and exports a playable file in a supported browser.
- An AI follow-up can propose a change to the current draft. A proposal changes the draft only after approval, and the conversation stays out of published output.
- Projects created before multi-page support continue to open and render as single-page projects.

## Verification status

See [release verification](VERIFICATION.md) for the local Worker, Chromium playtests, media export checks, and the scope of GPT verification.
