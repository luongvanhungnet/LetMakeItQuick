# Launchpad Studio

Launchpad Studio builds websites, mobile web apps, 2D and first-person 3D games, and short videos in the browser. See the [product specification](SPECIFICATION.md) and [release verification](VERIFICATION.md).

Use Python 3 and Node.js 24 to build and test the project.

```sh
npm ci
npx playwright install chromium
python3 worker/build.py
npm test
```

On Windows, use `wsl -- python3 worker/build.py` or `python worker/build.py` if the `python3` command points to the Microsoft Store alias. The build generates the ignored `dist/server/index.js` deployment artifact from the tracked static files and Worker source.

Run `npm run dev` to open the built Worker at `http://127.0.0.1:4173`. The standalone dev server does not supply Sites authentication. Playwright uses a separate loopback server with test identities and a deterministic Responses API fixture. Sites GPT mode requires `OPENAI_API_KEY` as a server-side secret.
