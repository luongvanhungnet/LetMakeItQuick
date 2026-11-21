# Launchpad Studio roadmap status

The implementation in this branch is a locally verified launch workflow. Use [TODO.md](TODO.md) for the original requirements and this document for coverage and remaining launch gates.

## Reproduce the launch path

1. Run `npm ci`, `npx playwright install chromium`, and `npm test`. The test command builds the Worker first.
2. Set `LAUNCHPAD_DEV_USER=creator` in the local shell and run `npm run dev`. The server listens only on loopback. It uses a durable local SQLite database with the same schema as D1. Omit the dev identity to explore the signed-out experience.
3. Choose **Atlas Product Launch** or **Field Guide Store**, name the draft, and edit the first page. Use **Cloud workspace** to opt in to saving this project. Use **Product data** to inspect sample records and see production form responses.
4. Open **Hosted releases**, enter release metadata, and stage the project. Open its staging preview, switch desktop/mobile sizes, and exercise the test form. Publish the staged version and open the stable release. Set the release visibility to Public to allow unauthenticated Worker requests when the hosting platform also permits them.
5. Use **Make a video ad** to add a screenshot, choose an aspect ratio, and export the ad and thumbnail. Open the generated campaign link to exercise attribution. Reports distinguish creator/test traffic from customer traffic.
6. Use **Package & sell** to export a ZIP and prepare a test listing. Choose hosted access or a downloadable product. Open the listing and test a decline, a successful purchase, delivery, and refund. The local simulator does not charge customers.
7. Open **Operations**. Select the **Test** activity view for simulated orders. Run an availability check and simulate an error. Publish a second version, then use **Hosted releases** to roll back to the first version.

## Implementation coverage

| Roadmap area | Implemented | External or incomplete verification |
| --- | --- | --- |
| P0.1 Template discovery | Goal and type filters, search, interactive desktop and mobile demos, template contents, named drafts, anonymous sample, and explicit opt-in cloud import. | Anonymous access on a deployed host depends on its access policy. |
| P0.2 Build and manage | Sites identity integration, consented sync, revision checks, up to 20 draft versions, restore, editable JSON backup, resized image uploads with attribution and license, forms, sign-in entry, sample and searchable records, downloads, production form inbox, integration URL and secret-name settings, and AI review with undo. | Arbitrary third-party integration execution, general-purpose customer database tables, and hosted storage provisioning are open. The initial image workflow stores bounded images in draft data. |
| P0.3 Test | Versioned staging with responsive preview, simulated forms, test listing access, retained blocker/review findings, and journey smoke checks. Preflight evaluates known links, assets, markup settings, and possible embedded credentials. | Remote link and asset availability, automated accessibility audits, production load tests, and a human usability study are open. |
| P0.4 Release | Stable hosted route, public/private authorization inside the Worker, metadata, indexing, staging, release history, deployment and rollback, and an optional review requirement. | Production D1/identity setup, public host access, DNS and TLS activation, and external smoke tests remain launch gates. |
| P0.5 Video ads | Editable landscape, square, and portrait ad templates; screenshot uploads; timeline titles and transitions; caption export, a thumbnail, campaign copy and links, and draft/release provenance. Optional creator-provided music and voice tracks require rights confirmation. | No automatic product screenshot capture. Test playback and downloaded media in each supported production browser. |
| P0.6 Sell | Offline release ZIP and listing material, hosted or download delivery, previews, pricing, orders, signed Stripe test callbacks and reconciliation adapter, refund and revocation, and an itch.io submission checklist. | The itch.io guide’s ZIP and root `index.html` requirements were checked. Real Stripe sandbox account execution, live charges and payouts, and an actual itch.io submission are open. |
| P0.7 Operate | Live/test reports, comparison periods, source/campaign metrics, release funnels, ledger-derived revenue and refunds, CSV and privacy export, availability checks and alerts, error simulation, support link, and confirmed scoped workspace deletion. | Hosted monitoring requires a scheduler and a public origin. External notifications, billing-account deletion, and live provider reconciliation remain open. |
| P1 Team | Owner, reviewer, and viewer roles; one-time invitation codes; a project comment thread; reviewer approval tied to a specific staged version. | Shared editing is outside the current team roles. |
| P1 Catalog | Template submissions, configured reviewer approval, licensing and credit, and approved version history. | Creator payouts and an externally operated curator process are open. |
| P1 Install and distribute | Installable PWA ZIP with manifest, icons, and offline cache. Browser HTML and game listing kits are available separately. | Native signing, store review, device matrices, and an externally submitted storefront pilot are open. |
| P1 Growth | Filters and release breakdowns, campaign funnels, CSV, signed-in visitor cohorts, and optional ad audio and captions. | Subscriptions, coupons, trials, and more storefronts remain open. |

## Host configuration and ownership

- Apply `worker/migrations/0001_workspace.sql` to a D1 database bound as `LAUNCHPAD_DATA` before running the Worker in a hosted environment. Keep migration SQL under version control.
- The Worker uses trusted Sites-provided identity headers. Direct public deployments must provide equivalent gateway authentication before exposing authenticated APIs. The loopback test identity is for local testing.
- Configure `OPENAI_API_KEY` as a server-side secret if GPT features are needed.
- Configure `STRIPE_TEST_SECRET_KEY` and, for signed callbacks, `STRIPE_TEST_WEBHOOK_SECRET` in a Stripe test account. Point the webhook at `/api/commerce/stripe-webhook`. The server rejects live Stripe mode.
- Configure `LAUNCHPAD_CATALOG_REVIEWER_ID` with the authenticated reviewer’s platform ID to enable template approvals.
- A Worker cron trigger can invoke scheduled uptime checks when `LAUNCHPAD_PUBLIC_ORIGIN` contains the operator-managed HTTPS origin. Checks use the known release route and persist an internal alert when a public release fails to respond.
- Set `LAUNCHPAD_RETENTION_ANALYTICS=enabled` after reviewing your privacy disclosure. Cohorts count signed-in customer visits by week, exclude creator and anonymous traffic, and keep project-scoped hashed identifiers server-side.
- After the operator connects a custom hostname with TLS, configure `LAUNCHPAD_RELEASE_DOMAINS` as a JSON object mapping that hostname to a public release slug. The Worker serves that release at the alias root.
- The existing Launchpad Studio Site is private. Public customer access and custom domains require the operator to connect a host and set its access explicitly.

## Verification boundary

Worker tests exercise separate creator, reviewer, customer, and anonymous identities, including duplicate checkout, release rollback and gating, draft conflicts, test/live form separation, and reconciliation. Browser tests exercise the creator UI, media export, playable games, staged and hosted playback through a loopback Worker, and the installable package. The local test server is not a production public URL. No live payment, public DNS activation, store approval, or customer usability session is claimed.
