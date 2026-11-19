# Security Policy

ChallengeLock is a fan-made static web app (GitHub Pages) with an optional Electron desktop build. The web app has no backend, no accounts and no analytics.

## Supported versions

| Platform               | Supported version                                                       |
| ---------------------- | ----------------------------------------------------------------------- |
| Web app (GitHub Pages) | Always the latest deployment; fixes ship with the next deployment.      |
| Desktop app (Releases) | Only the latest desktop release from this repository's GitHub Releases. |
| Older desktop releases | Not supported; please update to the latest release.                     |

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Use GitHub's private vulnerability reporting instead:

- Security tab → **Report a vulnerability**
- Direct link: <https://github.com/makooyyy/ChallengeLock/security/advisories/new>

Please include:

- what the issue is and which part of the app it affects (web app, desktop wrapper, Service Worker or release pipeline);
- steps to reproduce it (a proof of concept if possible);
- the affected version and platform (browser, operating system, desktop build number);
- the impact you expect, and whether the problem is already public.

You will get an initial response within a few business days. Please give the maintainer a reasonable window to ship a fix before publishing details; coordinated disclosure and credit in the advisory are welcome. Issues are triaged best effort: this is a small hobby project, so there is no paid bounty or guaranteed response time.

## Scope

In scope:

- HTML, CSS, JavaScript and the Service Worker in this repository;
- the Electron wrapper in `desktop/` (local HTTP server, preload bridge, renderer settings);
- the release tooling in `.github/workflows/` (build and publishing pipeline).

Examples: cross-site scripting through catalog data or saved state, Service Worker cache poisoning, path traversal in the desktop local server, tampering with the desktop auto-update feed, leaking local data, or a compromised build/release step.

Out of scope:

- vulnerabilities in third-party services and assets: the Deadlock API (`api.deadlock-api.com`), the image bucket, GitHub Pages and GitHub Actions themselves, browsers, operating systems;
- social engineering, physical access, malicious browser extensions or modified local files;
- issues that require an already-compromised device or a non-default, unsupported configuration.

## Data the app stores and sends

- The app is static: there is no server-side storage, no user accounts, no telemetry and no cookies.
- Settings, history, favourites and the match timer are kept only on the user's device in `localStorage` (`dlr.v1`, `dlr.timer`); they are never uploaded to a server.
- Shareable links carry the seed and generator settings in the URL fragment (`#...`), which browsers do not send to the web server.
- The web app makes read-only requests to the public Deadlock API for catalog data and hero/item images; standard request metadata is the only information sent.
- The desktop build starts a local HTTP server bound to `127.0.0.1`, serves the bundled web assets with a path-traversal guard, and opens a `BrowserWindow` with `contextIsolation: true` and `nodeIntegration: false`. The preload script only exposes `{ platform, isDesktop }`. Auto-update metadata and installers are downloaded over HTTPS from this repository's GitHub Releases.
