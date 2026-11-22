# Hosted uptime checks

Launchpad checks up to 20 public release URLs in each interval. The Worker records the HTTP status, latency, slug, version and project. Failed requests appear in Operations. When configured, Resend accepts one notification per failing release per UTC hour. A delivery state of `accepted` confirms provider acceptance. Mailbox delivery requires a separate check.

A linked Sites task can trigger the Worker outside an open browser. Read this Site’s service credential using the owner-authorized Sites integration and pass it on standard input to `python3 scripts/check-hosted-uptime.py` from the deployed source. The script sends credentials only to the fixed platform hostname, rejects redirects, and prints the interval receipt. A concurrent call returns the existing run. If the service credential rotates, update the separate `LAUNCHPAD_MONITOR_KEY` Site secret to the lowercase SHA-256 hex digest of the UTF-8 string `launchpad-uptime-v1:` followed by the new credential. Each request can run only the predefined public-release checks.

Configure `LAUNCHPAD_PUBLIC_ORIGIN` as the platform HTTPS origin. Set `RESEND_API_KEY` as a secret, `LAUNCHPAD_ALERT_FROM` to a verified Resend sender and `LAUNCHPAD_ALERT_TO` to the operations recipient. Manual availability checks and scheduled checks share the delivery path. The in-app error simulator stays in test analytics.

## Product data

Upload the draft to Cloud workspace, add a Searchable records block and open Product data. Select the block and environment, then save its records. An empty customer code makes a row visible to everyone permitted to open the release. A signed-in visitor finds their product-specific code in a Sign-in block. Staging and production maintain independent revisions and feeds.

The operator configures `LAUNCHPAD_RECORD_CONNECTORS` as a JSON array. Each entry names an owner, project and environment, a short feed name, an exact HTTPS URL, and an optional server-side credential name. For example:

```json
[{"owner":"<Sites user ID>","projectId":"<draft UUID>","environment":"staging","name":"calendar","url":"https://feeds.example.org/staging/events","secret":"LAUNCHPAD_FEED_CALENDAR_STAGE"}]
```

A feed returns up to 100 rows with string fields `name` and `details`, plus an optional `customer` code. Refresh replaces the selected list only after validation. A revision conflict preserves the previous data. For remote link and media checks, set `LAUNCHPAD_PREFLIGHT_ORIGINS` to comma-separated trusted HTTPS origins. Each staged snapshot checks up to 12 distinct URLs without forwarding authentication or following redirects.

Download blocks accept one uploaded file up to 64 KiB. Its bytes travel with the saved draft and frozen release. The combined encoded release is limited to 190,000 characters. The cloud draft request limit is 512,000 bytes.

## Account deletion

In Cloud workspace, open Cloud data and privacy for export and deletion. Cloud data deletion removes drafts, their history, staging data, managed lists, form responses and operations data. Published release history, checkout records and browser-local drafts are retained. Request deletion of the platform account through the [OpenAI Privacy Portal](https://privacy.openai.com/).

With the operator setting `LAUNCHPAD_RECOVERY_DRILL=enabled`, a monitor run publishes the reserved synthetic sample `launchpad-release-check`, backs up its draft, example form and live pointer in D1, restores them to a separate synthetic namespace and verifies their content. The resulting receipt records the release ID. For an external browser rehearsal, pass the same service credential on stdin to `node scripts/verify-hosted.mjs --rehearse`. Set `NODE_USE_ENV_PROXY=1` on networks that require an environment proxy. This command publishes a second version of the synthetic sample, submits a labeled test form through its stable URL, checks private-resource denial, and restores the baseline. The fixture actions require the monitoring credential, accept only the two predefined phases, and check the dedicated synthetic owner. Protected projects and their histories remain outside the drill.

## Analytics definitions

A visit is a rendered shell request for a release. Prefetches, HEAD requests and uptime probes are excluded. Creator visits and staging visits are counted in test activity. Purchase conversion divides purchases by visits within the same period and mode. A zero denominator displays a dash. Signups count accepted forms on signup journeys and the first identified customer returning through that product’s sign-in link. The stable release ID attributes each event to its published version. CSV rows include the release title, version and slug.
