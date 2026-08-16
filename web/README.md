# EduNexus Web

React + Vite + Tailwind frontend for the EduNexus Digital SAT platform. See
`../CLAUDE.md` for architecture, `../build-roadmap.md` for the phase plan, and
`../backend/README.md` for the API this talks to.

## Setup

```bash
npm install
cp .env.example .env   # only needed for a deployed build
```

## Run

The backend must be running first:

```bash
# terminal 1
cd ../backend && .venv/Scripts/python.exe -m flask --app wsgi run --port 5055

# terminal 2
npm run dev        # http://localhost:5173
```

In development Vite proxies `/api` and `/health` to `127.0.0.1:5055`, so
requests are same-origin and CORS never enters the picture. Deployed builds
call `VITE_API_URL` directly and rely on the backend's CORS allowlist.

## Tests

```bash
npm test                          # unit tests (vitest)
npx playwright test               # end-to-end, needs both servers running
npx playwright test e2e/accessibility.spec.js
npx playwright test e2e/screenshots.spec.js   # writes to screenshots/
```

The end-to-end suite expects the local database to contain at least one active
test form. Build one with `python -m scripts.build_form "Local Mini 1"
--questions-per-module 8 --minutes 12` after importing questions.

## What runs where

The client renders and reports. It never decides anything the exam depends on:

| Decision | Where it happens |
|---|---|
| Which module 2 a student gets | Server (`routing_service.py`) |
| Whether an answer was correct | Server, on submission |
| When a module runs out of time | Server; the on-screen clock is display only |
| Scaled scores | Server (`scoring_service.py`) |

The countdown in the test player re-syncs to the server's `seconds_remaining`
on every response, and when it reaches zero it **asks** the server what happens
rather than ending the module itself. A client that expired its own module
would let anyone with devtools award themselves extra time.

## Token handling

Access and refresh tokens live in `localStorage` (`src/api/tokens.js`). Bearer
tokens rather than a cookie session is a `CLAUDE.md` requirement so that one
API serves this app and the Flutter clients identically. The tradeoff is that
an XSS bug can read the token, which is why access tokens last 15 minutes and
refresh tokens are individually revocable server-side.

**Refresh is single-flight, and that is a correctness requirement.** The
backend rotates refresh tokens — using one revokes it. If two requests 401 at
the same moment and each starts its own refresh, the second presents a token
the first already revoked and the user is logged out mid-test. `client.js`
therefore shares one in-flight refresh promise between all callers.
`src/api/client.test.js` covers this; removing the guard makes it fail.

## Math

Question text renders LaTeX through KaTeX: `$…$` inline, `$$…$$` display.
`MathText` splits the text and only ever injects KaTeX's own output as HTML —
plain segments go through React as text nodes, so authored content cannot
inject markup. Unparseable expressions render as their literal source rather
than throwing.

## Accessibility

Roadmap task 5.7. `e2e/accessibility.spec.js` runs axe-core against every
screen at WCAG 2.1 AA plus keyboard-only paths that axe cannot judge: signing
in, answering and flagging a question, and the skip link. It also asserts the
test player does not overflow horizontally at 375px.

## Build

```bash
npm run build      # -> dist/
npm run preview
```

KaTeX's fonts and parser dominate the bundle (~536 kB raw, ~163 kB gzipped).
Worth code-splitting if it ever matters; it is one cacheable download today.

## Deployment

Cloudflare Pages, per `CLAUDE.md` §8:

| Setting | Value |
|---|---|
| Root directory | `web/` |
| Build command | `npm run build` |
| Output directory | `dist` |
| `VITE_API_URL` | the Railway API origin |

A SPA needs unknown paths served `index.html` or a refresh on `/tests/123`
404s. `public/_redirects` handles that.

After deploying, add the Pages origin to the backend's `CORS_ORIGINS`
environment variable in Railway and redeploy, or every request from the
browser fails.
