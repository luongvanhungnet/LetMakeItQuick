# Launchpad Studio

Launchpad Studio is a browser-based editor for websites, mobile web apps, 2D games, first-person 3D games, and short videos. Start with a template or a blank project, edit it in a live preview, then export it or stage and publish it to a stable release URL.

- Save drafts to an opt-in cloud workspace, restore revisions, and download editable backups.
- Configure forms, searchable records, and file downloads. Preview the staging release on desktop and mobile before publishing, and roll back to an earlier version when needed.
- Export standalone projects, installable web app ZIPs, and campaign videos with captions. Use the local checkout simulator to test orders and refunds, then inspect campaign attribution in Operations.

## Run locally

Use Node.js 24 and Python 3. Install dependencies and the Chromium build used by Playwright.

```sh
npm ci
npx playwright install chromium
```

Build the Worker and start the studio with a local creator identity.

```sh
python3 worker/build.py
LAUNCHPAD_DEV_USER=creator npm run dev
```

In Windows PowerShell, use `npm.cmd` and `npx.cmd` for the install commands. If `python3` opens the Microsoft Store alias, use `python`.

```powershell
python worker/build.py
$env:LAUNCHPAD_DEV_USER = 'creator'
npm.cmd run dev
```

Open [the local studio](http://127.0.0.1:4173). The dev server uses `.launchpad-local.sqlite` by default. Omit `LAUNCHPAD_DEV_USER` to use the signed-out experience. The build generates the ignored Worker bundle at `dist/server/index.js` and copies the hosting configuration and Drizzle migrations into `dist/`.

To try the release workflow, create a draft from **Atlas Product Launch**, edit the headline, and open **Hosted releases** in the editor toolbar. Save the draft to staging and inspect the desktop and mobile checks. If the checks are interrupted, **Retry browser checks** runs them on the same staged version. After the checks pass, publish the version and open the stable release URL. [Roadmap walkthrough](ROADMAP_STATUS.md#reproduce-the-launch-path)

## Run tests

```sh
npm test
```

The command builds the Worker, runs the Node suite, and runs the Chromium functional suite and 60-second 3D benchmark. Playwright starts a loopback server with a test identity and a deterministic OpenAI Responses API fixture. Hosted GPT mode uses the server-side `OPENAI_API_KEY` secret.

On Windows PowerShell, run the same steps directly when `python3` is unavailable.

```powershell
python worker/build.py
node --test "tests/*.test.mjs"
npx.cmd playwright test
```

Use `--project browser` to run only the functional cases or `--project performance` to run only the benchmark. Stop the dev server first or set `LAUNCHPAD_TEST_PORT` to a free port. Playwright saves failure screenshots and traces under `test-results/` by default.

### Local results for `ce5a654`

The build passed, along with 29 of 29 Node tests and 25 of 26 Chromium tests. The [workspace browser case](tests/workspace.spec.mjs#L63) failed intermittently. The full run left an unrelated record visible after searching. Three reruns produced one pass, one search input timeout, and one publish attempt blocked by mobile viewport overflow. The same case passed three times on the pre-pull commit `463ed1d`.

The 60-second benchmark passed on Windows 11 with headless Chromium and SwiftShader. It measured 60.00 FPS, 18.2 ms p95 frame time, and zero stalls over 50 ms. The project thresholds are at least 55 FPS and at most 22 ms p95.

## Project documentation

- [Product specification](SPECIFICATION.md)
- [Roadmap and launch walkthrough](ROADMAP_STATUS.md)
- [Release verification](VERIFICATION.md) and [checked-in launch evidence](evidence/list2/README.md)
- [Hosted monitoring and product data configuration](MONITORING.md)
