# Account and persistence notes

The native HTTP server binds to `127.0.0.1` by default. It is intended to run as one local process. The repository does not coordinate multiple processes writing the same data directory.

`data/v2-state.json` holds accounts, hashed session tokens, owned game states and action replay metadata. Every account/session/game mutation writes a new snapshot to a unique temporary file, flushes the file, then atomically renames it. Memory advances only after replacement succeeds. Startup fails on a corrupt v2 repository instead of silently discarding it. Anonymous v1 individual JSON saves are deliberately ignored; they remain untouched.

Passwords use asynchronous scrypt with a unique 16-byte salt, N=16384, r=8, p=1 and a 64-byte output. Verification uses timing-safe comparison. API responses contain only public account fields, never password material or session tokens. Session cookies use 32 random bytes, HttpOnly, SameSite=Lax, a 30-day expiry and Secure on a TLS connection. The server does not trust forwarded protocol headers. Registering from an active guest session upgrades the same identity and preserves its saved games. Logging into an existing separate account switches to that account.

Mutations require JSON and pass same-origin/Fetch Metadata checks. JSON bodies are capped at 16 KiB; authentication attempts have bounded per-address and login-identifier limits. Every owned game route checks the current session and owner. Action settlement re-reads both after the complete request body and performs the transition, replay record and atomic persistence synchronously, so overlapping requests cannot overwrite a settled month.

Action request IDs must be UUIDs. Successful replay returns the original response even after later actions or a restart. The core guarantees append-only history, so replay snapshots store a history prefix length rather than duplicating every prior monthly row. This keeps history storage linear while preserving the original response. Successful action identifiers remain available for the life of a game.

Leaderboards use fully completed Standard games only, excluding bankrupt, unfinished and Free games. Each account contributes its best result per mode/difficulty category. They expose display names and results without email addresses or internal account IDs. Public configuration exposes the exact core configuration, including `settings` and `tradeFeeRate`, for consistent previews.

Run `node --test tests/api.test.js tests/accounts.persistence.test.js` for account isolation, 20 concurrent accounts, password/session behavior, automatic restart persistence, request replay, overlapping bodies, category leaderboards, malformed requests, CSRF, static-path isolation and authentication throttles.
