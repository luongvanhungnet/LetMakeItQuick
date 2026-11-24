# Launchpad Studio remaining work

Audited `launchpad-roadmap` at `74623b2` against [TODO.md](TODO.md), [ROADMAP_STATUS.md](ROADMAP_STATUS.md), the implementation, and its tests. Scope covers the website and mobile web app launch path, plus the existing game performance gate. Store and Stripe work are out of scope.

## Implementation update

The table records the follow-up work against the original audit below. Checked boxes indicate verified completion of that item. The [evidence directory](evidence/list2/README.md) includes the hosted receipts and downloadable artifacts.

| Item | Result |
| --- | --- |
| Production host | HTTPS deployment, D1 schema, owner-only workspace and private-release denial verified. Platform public access and custom DNS/TLS remain open. |
| Customer components | Product return path, staging test sign-in, per-customer records, searchable data and uploaded free files implemented. Live identity-provider round trip with a real customer remains open. |
| Environments | Staging and production records and connector configuration are isolated. Server-side feed success, error and secret isolation passed tests. A 64 KiB file survived a hosted release readback and download. |
| Preflight and staging | Configured-origin HTTP checks, asset size/latency, accessible names, overflow checks and desktop/mobile dry runs implemented. A staging test customer can sign in without touching production data. |
| Post-deploy | Automatic browser checks record results on the exact version. The external hosted rehearsal exercised a signup, private-resource checks, and rollback. |
| Monitoring | Hourly schedule enabled and a real hosted access failure attributed to the correct release. Resend mailbox delivery awaits credentials. |
| Recovery and accounts | Hosted synthetic draft, form and live pointer recovery verified. Real-user export and deletion remain open. |
| First-time acceptance | Complete automated creator flow on loopback, plus a separate hosted service-access journey. Independent usability and public first-deploy timing remain open. |
| Video ad | Product page capture and exported playback verified with Chromium, Firefox and WebKit. |
| Analytics | Known hosted campaign counts, version labels and CSV checked. Isolated identity tests cover creator/test classification and conversion denominators. |
| PWA | Desktop HTTPS installation, offline launch, cache update and recovery verified. Physical mobile device validation remains open. |
| 3D | 57.13 FPS average, 39.60 ms p95. Frame-time and intended-device gates remain open. |

## P0 — Launch blockers

- [ ] **Deploy to a public production host.** Apply the [D1 migration](worker/migrations/0001_workspace.sql), bind `LAUNCHPAD_DATA`, configure the trusted identity gateway and server-side secrets, enable public release access, and activate HTTPS and the custom hostname. Verify anonymous access to a public release and authorization on private releases and workspace APIs. The Worker already supports stable routes, public/private releases, and hostname aliases. [Hosting configuration](ROADMAP_STATUS.md#host-configuration-and-ownership) · [Release routing](worker/releases.mjs)
- [ ] **Finish customer sign-in and data-backed components.** Return signed-in customers to the product and verify access to customer-specific records. Connect searchable lists to persistent records and let creators select an uploaded file for a free download. The current sign-in block opens a platform sign-in link, record blocks use inline rows, and download blocks select bundled media. [Block renderer](dist/blocks.js) · [Workspace API](worker/workspace.mjs)
- [x] **Finish environment-specific data and integrations.** Give creators separately managed staging and production records and integration settings. Execute supported integrations server-side with environment-bound secrets and show actionable failures. The editor currently stores an integration URL and secret variable names, and forms already distinguish test submissions from live responses. Confirm storage limits and durability for uploaded media on the hosted backend. [Editor settings](dist/workspace.js) · [Worker data layer](worker/data.mjs)
- [x] **Expand preflight and staging checks.** Check the availability of external links and media, audit accessibility, flag slow assets, and exercise forms and sign-in with test accounts at desktop and mobile sizes. Reuse the existing staging snapshots, retained blocker/review findings, and structural journey checks. [Preflight and smoke checks](dist/release-model.js) · [Release browser tests](tests/releases.spec.mjs)
- [x] **Automate the post-deploy smoke test.** Open the stable URL from outside the Worker, confirm the correct release renders, and run the configured non-payment customer journey. Persist the result with the deployed version, surface failures, and verify rollback on the hosted URL. The deployment record currently leaves live browser checks manual. [Deployment status and rollback](worker/releases.mjs)
- [ ] **Activate and verify production monitoring.** Configure the scheduled uptime trigger and public origin. Trigger a real hosted error or availability failure, verify the alert identifies the affected release, and add delivery to a configured notification destination. Operations already includes in-app alerts and test error simulation. [Monitoring and alerts](worker/operations.mjs) · [Host configuration](ROADMAP_STATUS.md#host-configuration-and-ownership)
- [ ] **Verify hosted recovery and account lifecycle.** Rehearse restoring hosted data and confirm that drafts, form records, and live release pointers recover correctly. Verify export and deletion with a real hosted identity and document how users request deletion of the platform account. Draft history, editable backups, workspace export and scoped deletion are already implemented. [Workspace lifecycle](worker/workspace.mjs) · [Workspace browser tests](tests/workspace.spec.mjs)

## P0 — Launch acceptance evidence

- [ ] **Run one hosted browser journey and a first-time usability session.** Start from a template, edit and save, pass preflight, publish, submit a form or complete sign-in, export a playable ad and release ZIP, follow a campaign link, verify attribution, restore a draft, and roll back a release. Record time to first successful public deploy and retain the URL, exported files, test results, and evidence of the attributed visit and recovery. Existing browser cases cover separate parts of this flow on loopback. [Launch acceptance](TODO.md#launch-acceptance) · [Branch verification](ROADMAP_STATUS.md#verification-boundary)
- [x] **Verify ad output across supported browsers.** Check playback, seeking, captions, and optional audio in downloaded exports. Add automatic product screenshot capture where needed to complete the template-to-ad flow. The current ad editor accepts uploaded screenshots. [Launch ad editor](dist/launch-video.js) · [Ad browser tests](tests/launch-video.spec.mjs)
- [x] **Verify analytics definitions and hosted attribution.** Confirm visits, signups, conversion denominators and test/live classification against known hosted events. Check campaign and release labels through a version change and confirm exported results match the dashboard. [Operations metrics](worker/operations.mjs) · [Reporting tests](tests/operations.test.mjs)

## P1 — Follow-up validation

- [ ] **Verify PWA installation and updates on target devices.** Install from HTTPS on supported desktop and mobile browsers, launch offline, then ship an update and verify cache replacement and recovery. The current test checks the generated package and offline serving in Chromium. [PWA browser test](tests/pwa-package.spec.mjs)
- [ ] **Close the existing 3D performance gate.** The branch recorded 44.68 FPS average and 46.00 ms p95 over 60 seconds with SwiftShader, against targets of at least 55 FPS and at most 22 ms p95. Profile and retest representative gameplay on the benchmark environment and intended devices, retaining frame timing and playthrough evidence. [Recorded benchmark](ROADMAP_STATUS.md#branch-test-results) · [Performance test](tests/studio.spec.mjs#L652)

## Original audit verification

- The Worker build succeeded with `python worker/build.py`. All 24 Node tests passed locally with `node --test "tests/*.test.mjs"`.
- All four targeted Chromium tests passed locally, covering release staging and rollback, offline PWA packaging, workspace recovery, and the product editor.
- Hosted deployment, real-user usability, and device or performance results above are open based on the checked-in evidence.
