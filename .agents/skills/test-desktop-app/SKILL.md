---
name: test-desktop-app
description: Use when testing the Hubble Electron desktop app, especially with Computer Use, screenshots, clicking, typing, or verifying a real note edit in the running app.
---

# Test Desktop App

1. Run `pnpm dev:desktop`.
2. Read the terminal output for `Computer Use app: <bundle-id>` and use that exact bundle ID with Computer Use.
3. The dev app auto-opens an editable playground at `apps/desktop/.dev-electron/playground`; use it instead of file pickers or checked-in fixtures.
4. When you're done, stop the dev server and confirm no `Hubble Dev` process remains.
