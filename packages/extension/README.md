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
                                              ├─ in-memory state
                                              └─ storage.session (rehydrate)
```

All popup → background traffic flows through the typed `sendMessage`
helper in `src/shared/messages.ts`. Add a new request by extending the
`Request` union and the `ResponseFor` conditional type, then handling
the new `type` in `background/serviceWorker.ts`'s `handle`.

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

Currently covers the popup ↔ background message round-trip and the
`storage.session` rehydration path.
