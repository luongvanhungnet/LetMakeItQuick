# Launchpad Studio product roadmap

**Goal** — Make Launchpad Studio the fastest practical way for an independent creator or small team to turn a template into a tested, deployed IT product, promote it, earn revenue, and operate it from one workspace.

**First release path** — Pick a website or mobile web app template → edit with live preview and optional AI → test → deploy publicly → make a video ad → sell access or a downloadable product → track sales and reliability. Extend the same workflow to 2D and 3D games once the first path works.

The current baseline includes templates, live previews, browser-local drafts, published snapshots, standalone HTML, video recording, and AI proposals. See the [product specification](SPECIFICATION.md) and [verification report](VERIFICATION.md). The tasks below cover what is still needed for a customer-facing launch.

## P0 — Make the first launch workflow usable end to end

### 1. Find a template and start a project

- [ ] Organize templates by customer goal, including product landing page, small business site, paid digital download, client portal, and playable demo.
- [ ] Add searchable filters, live template demos, and a description of the pages, features, sample data, and publish targets each template includes.
- [ ] Guide first-time users from template choice to a named project with an editable first page and a clear next action.
- [ ] Provide a sample project users can explore without an account and a path to keep their work when they sign up.

### 2. Build and manage a product

- [ ] Add accounts and cloud drafts with autosave, version history, restore, and import/export of an editable project backup. Migrate existing browser-local drafts with user consent.
- [ ] Add a media library for uploads with image resizing, alt text, asset replacement, attribution, and license information.
- [ ] Support common product features through reusable components: forms, customer sign-in, records, searchable lists, file downloads, and integrations.
- [ ] Bring data and integration settings into the editor. Separate sample data, staging data, production data, and server-side secrets.
- [ ] Show AI proposals as a reviewable diff. Require explicit approval and provide undo for applied changes.

### 3. Test before publishing

- [ ] Add a staging preview with desktop and mobile views, test accounts, and test checkout where applicable.
- [ ] Run a preflight check for broken links, missing media, form failures, accessibility issues, slow assets, exposed credentials, and missing release settings.
- [ ] Add a reusable smoke test for the main customer journey, from landing page through signup, checkout, or download.
- [ ] Retain test results with the release and distinguish issues that block publishing from items the creator can review later.

### 4. Deploy and update safely

- [ ] Offer a hosted public release with a stable URL, custom domain, HTTPS, and clear public or private access controls.
- [ ] Publish versioned releases from staging, run a post-deploy smoke test, and provide a one-click rollback.
- [ ] Support product metadata, social preview images, favicons, and search indexing controls.
- [ ] Show build and deployment progress, actionable errors, release history, and the currently live version.

### 5. Make and share a video ad

- [ ] Generate an editable launch video from product screenshots, key features, brand assets, and a call to action.
- [ ] Provide short ad templates in landscape, square, and portrait, with captions and editable timing. Reuse the existing timeline and browser recording.
- [ ] Export playable video, a thumbnail, and accompanying copy with a trackable product link.
- [ ] Show which project version and assets the ad uses so creators can update it after a release.

### 6. Package, list, and sell the product

- [ ] Build a downloadable release ZIP with the product, version, install guide, changelog, and asset licenses. Include a store listing kit with screenshots, icon, description, and promo video.
- [ ] Support two initial sales flows: hosted paid access and a downloadable digital product. Add a preview page customers can use before buying.
- [ ] Integrate one payment provider in sandbox first. Test successful and failed payments, duplicate payment events, receipts, refunds, and granting or removing customer access.
- [ ] Give creators a pricing editor, order history, revenue and fee breakdown, and clear setup steps for payouts.
- [ ] Pick one external storefront to pilot. Validate its packaging requirements and provide a guided submission checklist. Keep browser HTML, installable web apps, and native store packages distinct in the export UI.

### 7. Measure and operate after launch

- [ ] Add charts for visits, signups, purchases, conversion rate, net revenue, and refunds with date ranges and prior-period comparisons.
- [ ] Track traffic source and campaign links so creators can compare video ads and other launch channels.
- [ ] Define each metric and distinguish test activity from customer activity. Reconcile orders and revenue totals with the payment provider.
- [ ] Add uptime checks, application errors, failed payment notifications, and alerts with links to the affected release or order.
- [ ] Provide backups and verified restore, a customer support inbox or link, workspace access controls, data export, and account deletion.

## P1 — Expand after the first launch path works

- [ ] Add team roles, invitations, comments, and release approvals.
- [ ] Add a curated template marketplace with creator submissions, review, versioning, licensing, and payouts.
- [ ] Add installable web app packages and pilot one native store target. Verify signing, device behavior, store review, and updates before promising support.
- [ ] Add paid game and demo distribution with storefront bundles and device-specific playtests.
- [ ] Add subscriptions, coupons, trials, and additional storefronts where customer demand justifies them.
- [ ] Add configurable dashboards, CSV export, retention cohorts, and conversion funnels by product version.
- [ ] Add optional ad voiceovers, music, and captions with rights checks and creator review.

## Launch acceptance

- [ ] A first-time user can choose a template, change visible content, pass preflight, and deploy a public URL. Measure time to first successful deploy in usability sessions and use it to prioritize friction.
- [ ] A customer can open that product, complete a test purchase, receive the correct access or download, and receive a receipt. A refund updates both access and the revenue dashboard.
- [ ] The creator can export a playable ad and a release package, and can see a campaign visit and purchase attributed correctly.
- [ ] The creator can recover a draft, roll back a bad release, and identify a simulated production error from the workspace.
- [ ] The full journey passes browser E2E tests and a manual usability run. Retain the release URL, exported files, test results, and tracked purchase evidence.

