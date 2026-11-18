# ChallengeLock Desktop

Desktop wrapper (Electron) for the ChallengeLock web app.

## Development

```bash
npm install
npm start
```

The app serves the parent web project over a local HTTP server and opens it in an Electron window.

## Build (Windows portable)

```bash
npm run build
```

Output: `dist/ChallengeLock.exe`.

Before building, web assets are copied from the parent folder into `web/`.
