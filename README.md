# ✨ Explain This Diff

A Chrome extension that adds an AI-powered "Explain this Diff" button to GitHub pull request pages. Click it, and get a plain-English summary of what changed, why it matters, and what to double-check — right on the page, no tab-switching required.

![status](https://img.shields.io/badge/status-working-brightgreen)
![manifest](https://img.shields.io/badge/manifest-v3-blue)

---

## Demo

> Add a screenshot or short GIF here showing the button + summary panel in action.
> (Right-click → "Copy image" from your extension screenshot, drop it in a `demo/` folder, and reference it like: `![demo](demo/screenshot.png)`)

---

## Why this exists

Reviewing a pull request often means reading a wall of red/green diff lines before understanding *what actually changed and why*. This extension adds a one-click summary layer on top of GitHub's own diff view, so a reviewer gets the gist immediately and can dig into specifics only where needed.

---

## Architecture

```
┌─────────────────┐      diff text       ┌──────────────────┐      prompt      ┌─────────────┐
│  Chrome Extension │ ───────────────────▶ │  Express Backend  │ ───────────────▶ │   Groq API   │
│  (content script)  │ ◀─────────────────── │   (Node.js relay)  │ ◀─────────────── │ (Llama 3.3)  │
└─────────────────┘      AI summary       └──────────────────┘      completion    └─────────────┘
        │
        ▼
  Injected into
  github.com/*/pull/*/files
```

**Flow:**
1. Content script injects a button into GitHub's PR tab bar (works on both GitHub's legacy and current page templates)
2. On click, it scrapes the visible diff (`.file` blocks) for filenames and added/removed lines
3. The diff text is POSTed to a local Express server — never sent directly to Groq from the browser
4. The Express server holds the Groq API key server-side and forwards the request with a tuned system prompt
5. The AI's response streams back and renders in a styled panel, injected directly into the GitHub page, with a small markdown renderer for bold/code/bullets

---

## Why the backend exists (and isn't skipped)

The extension **never calls Groq directly.** If it did, the API key would need to live in client-side extension code — which anyone could extract by inspecting the extension's files. Instead:

- The extension only ever talks to `POST /explain` on the Express server
- The Express server is the only place that holds `GROQ_API_KEY` (via `.env`, never committed)
- This is the same reason real apps proxy third-party API calls through their own backend instead of calling them from a browser or mobile client directly

---

## Tech stack

| Layer | Tech |
|---|---|
| Extension | Manifest V3, vanilla JS (content scripts), MutationObserver for SPA navigation |
| Backend | Node.js, Express, CORS |
| AI | Groq API (Llama 3.3 70B) |
| Security | `.env` for secrets, backend relay pattern, HTML-escaping before markdown rendering |

---

## Project structure

```
explain-this-diff/           # Chrome extension
├── manifest.json
├── content.js
├── content.css
└── icons/

explain-diff-backend/        # Express server
├── index.js
├── prompts.js
├── package.json
└── .env                     # not committed — see .env.example
```

---

## Setup

### For users — just install the extension
The backend is deployed and live, so you don't need to run anything locally.

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `explain-this-diff` folder
4. Open any GitHub pull request's **"Files changed"** tab
5. Click **✨ Explain this Diff**

> Note: the backend runs on Render's free tier, so the very first request after a period of inactivity can take 20-50 seconds while the server wakes up. Subsequent requests are fast.

### For development — running the backend locally

```bash
cd explain-diff-backend
npm install
```

Create a `.env` file:
```
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

Run it:
```bash
node index.js
```

Then update `BACKEND_URL` in `content.js` to `http://localhost:3000/explain` and reload the extension.

---

## Known limitations / What I'd improve next

- **No automated tests yet** — the extraction and rendering logic would benefit from unit tests (e.g. Jest) given how much of it depends on GitHub's DOM structure.
- **Diff extraction is text-only** — it reads visible diff lines but doesn't yet handle collapsed/truncated large diffs that GitHub hides behind "Load more" links.
- **Single AI provider** — tightly coupled to Groq's API shape; a provider-agnostic adapter would make swapping models easier.
- **In-memory cache resets on server restart** — fine for a portfolio project's traffic level; a production version would use Redis so the cache survives deploys and restarts.
- **Free-tier hosting means cold starts** — the first request after inactivity takes 20-50 seconds while Render wakes the server. A paid tier or a keep-alive ping would remove this.

---

## What I learned building this

- Manifest V3 content scripts, host permissions, and match patterns
- Handling a real-world inconsistency: GitHub serves two different DOM structures for the same page depending on navigation path — solved with a fallback-selector pattern rather than a single hardcoded ID
- MutationObserver for surviving single-page-app navigation without full page reloads
- Why and how to keep API keys server-side, never in client/extension code
- Basic prompt engineering: iterating on a system prompt to get specific, non-generic AI output
- Building a minimal, safe markdown renderer (escape-then-convert, to avoid HTML injection from model output)

---

## License

MIT
