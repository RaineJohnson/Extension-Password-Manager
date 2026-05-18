# @password-manager/extension

Browser extension (Chrome MV3 + Firefox MV3) for the password manager.

## Build

```sh
npm run build           # both browsers
npm run build:chrome    # → dist-chrome/
npm run build:firefox   # → dist-firefox/
npm run dev:chrome      # rebuild on change
```

Load `dist-chrome/` via `chrome://extensions` → "Load unpacked", or
`dist-firefox/` via `about:debugging` → "Load Temporary Add-on…".

## Architecture

```
popup (React)  ──runtime.sendMessage──▶  background service worker
                                              │
                                              ├─ in-memory state + storage.session
                                              │     (locked, tokens, vault key)
                                              ├─ auth.ts   ──▶  /auth/*
                                              └─ vault.ts  ──▶  /vault/*
                                                          (HttpClient + crypto)
```

All popup → background traffic flows through the typed `sendMessage`
helper in `src/shared/messages.ts`. Every reply is an `Envelope` —
either `{ ok: true, data }` or `{ ok: false, code, message }`. The
helper unwraps the envelope and throws `ApiError` on the error branch
so pages can write a normal `try/catch`.

The popup never sees Argon2id, AES, or the network. It hands plaintext
to the worker; the worker derives material, talks HTTP, and (for vault
items) encrypts/decrypts under the in-memory vault key. The server
URL is injected at build time via `VITE_API_BASE_URL` (defaults to
`http://localhost:3000`).

Add a new request by extending the `Request`/`Success` unions in
`src/shared/messages.ts` and the `switch` in `background/serviceWorker.ts`.

## Service worker lifecycle

Chrome MV3 unloads the background service worker after **~30 seconds of
idle**. Firefox MV3 keeps event-page background scripts around longer
but can also unload them. The worker can be revived by any event
(message, alarm, install, etc.) but its in-memory state is gone.

For a password manager the worst-case shape of this is: the user unlocks
their vault, walks away for a minute, and on return is asked to
re-derive their master password just to autofill a login. Argon2id is
deliberately slow (hundreds of milliseconds at our parameters), so this
isn't a small annoyance — it makes the extension feel broken.

### Strategy: `chrome.storage.session` + explicit lock

We hold the unwrapped vault key in worker memory, and **mirror it into
`chrome.storage.session`** so a worker restart silently rehydrates. On
every cold start the worker calls `rehydrate()` before serving requests
(see `serviceWorker.ts`).

`storage.session` properties:

- **In-memory**: never written to disk.
- **Encrypted at rest**: Chrome 111+ encrypts the in-memory blob; Firefox
  115+ supports `storage.session` and is set as our `strict_min_version`.
- **Wiped on browser close**: locking the browser locks the vault.

An explicit lock action (and a future idle timeout) clears
`storage.session`, forcing the user to re-derive on next unlock.

### Alternatives considered

| Option                            | Why not                                            |
| --------------------------------- | -------------------------------------------------- |
| Re-prompt master password on every restart | Argon2id is slow; UX is hostile.            |
| `chrome.alarms` keepalive         | Chrome team explicitly disallows; brittle.         |
| Persist to `storage.local`        | Hits disk; needs a second encryption layer.        |
| Offscreen document                | Extra moving parts; defer until autofill needs it. |

This is the same trade-off Bitwarden and 1Password make: the vault stays
unlocked across worker restarts within a browser session, and locks on
browser close, on explicit lock, and (later) on idle timeout.

## Test

```sh
npm test
```

Covers the popup ↔ background envelope round-trip, the
`storage.session` rehydration path, the end-to-end auth and vault
orchestrators (register → login → CRUD → lock, plus refresh-on-401
and bad-credential branches against an in-memory `FakeServer`), and
the form validation helpers.

## Running the full demo

The popup talks to a running server (no offline mock). One-time setup
from the **monorepo root**:

```sh
npm install
npm --workspace @password-manager/server run migrate  # creates the SQLite/Postgres schema
npm --workspace @password-manager/server run dev      # http://localhost:3000
npm --workspace @password-manager/extension run build:chrome
# or: npm --workspace @password-manager/extension run build:firefox
```

That produces `packages/extension/dist-chrome/` (or `dist-firefox/`).
For a non-local server, set `VITE_API_BASE_URL` before the build —
the URL is baked into the bundle at compile time.

### Load the extension

**Chrome / Edge / Brave**

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select
   `packages/extension/dist-chrome/`.
4. Pin "Password Manager" from the toolbar puzzle-piece menu, then
   click the icon to open the popup.

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick
   `packages/extension/dist-firefox/manifest.json`.
3. Click the toolbar icon to open the popup.

### Exercising the flows

Pick any 12+ character master password — the server never sees it.

| Action | Input | What you should see |
| --- | --- | --- |
| Field validation | Submit empty form | Inline errors under each field |
| Password mismatch | Register, confirm ≠ password | "Master passwords do not match." |
| Weak password | Register with `<12` chars | Inline length error + red strength bar |
| Email already taken | Re-register the same email | Red "Email already in use." banner |
| Server unreachable | Stop the server, then submit | Red "Could not reach the server." banner |
| Bad credentials | Log in with the wrong password | Red "That email and master password did not match." banner |
| Happy path | Register a fresh email, log in | Routes to the vault list |
| Add / Edit / Delete | Use the buttons on each row | Server stores `{site, encryptedBlob}` only |
| Copy password | Click "Copy" | Plaintext copied to clipboard from worker memory |
| Open site | Click "Open" | New tab to `https://<site>` |
| Lock | Click "Lock" | Vault key wiped from memory; popup returns to Login |
| Change master password | Header "Change password" | Re-wraps the vault key; signs you out |

### Iterating

```sh
npm --workspace @password-manager/extension run dev:chrome
```

Rebuilds on save. After each rebuild, click the circular reload
arrow on the extension's card in `chrome://extensions` and reopen
the popup — MV3 doesn't hot-reload source into a running extension.
