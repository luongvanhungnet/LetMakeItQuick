# Launch verification

## Hosted rehearsal

Launchpad Studio’s private production deployment serves the stable [sample release](https://launchpad-studio.luongvanhungnet.chatgpt.site/launch/launchpad-release-check). The browser used the Site’s service credential at the platform gateway. The Worker received no signed-in customer identity.

- The first run opened the product at 1280 px and 390 px. Draft and staging API requests returned HTTP 401. [Browser results](hosted-browser.json)
- The next run published a second version, submitted a signup form, checked that a private release returned HTTP 404 and restored the original version at the same URL. [Rollback receipt](hosted-rehearsal.json)
- A subsequent version carried a 65,536-byte download in the stored release snapshot. The browser downloaded it, compared every byte to the fixture, completed the form, and verified the original version after rollback. [Download and rollback receipt](hosted-download-rehearsal.json)
- D1 retained the synthetic draft, form records and live pointer. The monitoring rehearsal restored these to a separate synthetic namespace. The anonymous uptime probe received HTTP 401 from the private gateway and recorded an application error for the affected release. Email delivery was unconfigured. [D1 readback](hosted-events.json)
- The recorded campaign had three visits to version one and one visit and signup on version two during the initial evidence window. The report and CSV functions used by the dashboard produced the retained release breakdown from those hosted events. [Campaign CSV](campaign-report.csv)

## Creator workflow

The automated acceptance run used two loopback origins for a signed-in creator and an anonymous visitor. It named an Atlas template, edited its headline, opted into cloud saving, staged the draft and published it. The run exported the ZIP and an ad using a captured product page, visited the campaign link, submitted the public form, checked attribution, released a second version and restored both the original release and a draft revision. The timing measures this scripted local run. A public first-deploy time and an independent first-time user observation are outstanding.

[Run receipt](acceptance.json) · [Release ZIP](atlas-release.zip) · [Video ad](atlas-acceptance-launch-ad.mp4) · [Ad captions](atlas-captions.vtt)

## Browser, installation and performance checks

- Real Chromium, Firefox and WebKit engines verified playback, seeking, caption cues and track duration. The WebM fixture also passed decoded-audio amplitude checks in all three. The product-page screenshot regression passed in all three engines. [Playback results](ad-playback.json) · [WebM](sound-test.webm) · [WebM captions](sound-test.vtt)
- Desktop Chromium installed the PWA from local HTTPS into a fresh profile, launched the installed app offline, updated it, and reopened the new content offline. The update suite also exercised a failed installation and cache recovery on desktop and an emulated Pixel 7. Physical phone installation remains open. [Desktop installation log](desktop-install.txt)
- A 60-second SwiftShader playthrough measured 57.13 FPS and a 39.60 ms p95 frame interval. The targets are at least 55 FPS and at most 22 ms p95. [Frame timing](swiftshader.json)

## Production dependencies

The platform hostname is active over HTTPS. Sites lists `launchpad.boombatsa.win` as pending DNS and certificate validation. The DNS zone requires these records:

| Type | Name relative to boombatsa.win | Value |
| --- | --- | --- |
| CNAME | launchpad | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.launchpad | openai-site-verification=G_pw_ylpr6M0yy2WweMr7aPUcJt8ggtbcXIZmlMFq5o |
| TXT | _cf-custom-hostname.launchpad | 21d56275-ae41-48f6-89f2-822ecab9607f |

The studio and creator APIs enforce owner access. Anonymous release access also requires a public platform audience. The audit used a private Site throughout. The hourly Sites uptime schedule is enabled. Live alert delivery requires a verified Resend sender and a server-side API key. See the [operator configuration](../../MONITORING.md).

## Regression results

All 29 Worker tests passed. All 25 functional Chromium cases passed across the regression run and targeted reruns. The launch rehearsal and native MP4 case were rerun after correcting a mobile grid overflow and fragmented MP4 track timing. The latest retained scripted run reached its first loopback publish in 7.152 seconds. The separate 60-second performance benchmark remains below its p95 requirement.
