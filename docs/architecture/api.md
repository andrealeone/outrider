# API

`src/daemon/api.ts` is the control plane: one `Bun.serve` instance bound to
the unix domain socket, nothing else. It is the only entry point into the
daemon; the CLI and TUI never call daemon internals directly, only this
socket, through the shared client (`src/shared/client.ts`) and protocol types
(`src/shared/types/protocol.d.ts`).

**Transport.** One socket, two protocols sharing it: plain JSON request/response
under `/v1/*`, and a WebSocket upgrade at `/v1/events` for the push stream. Bun's
`fetch`-with-`unix` support lets clients speak ordinary HTTP verbs over the
socket rather than inventing a line protocol; `ws+unix://` does the same for
the event stream. User-only socket permissions are the entire auth story, so
v1 carries no token: see [the trust-model note in
`companion-api-server.md`](../feature-analysis/companion-api-server.md) for
what changes if this ever grows a TCP listener.

**Dispatch.** `route` peels off `/v1`, upgrades `/v1/events`, and hands
everything else to `dispatch`, a flat chain of `method + head-segment`
checks rather than a router table: the surface is small and stable enough
that a table would be indirection without payoff. `serviceRoutes` further
splits `/v1/services/...` into entity routes (`PUT` / `PATCH` / `DELETE` on
`:id`) and action routes (`start` / `stop` / `restart` / `scale` / `logs`),
disambiguated by whether the last path segment names a known action for that
HTTP method (`POST_SERVICE_ACTIONS`, `GET_SERVICE_ACTIONS`,
`DELETE_SERVICE_ACTIONS`), which is why a standalone service id containing a
literal `start` segment would misparse, and why ids are otherwise free-form.

**Errors.** One shape everywhere: `{ error: { code, message } }`. `RegistryError`
codes map to HTTP status through `statusFor` (`not-found` → 404, `conflict` /
`route-conflict` → 409, `invalid` → 400, anything else → 400); config load and
template failures become 422 (`invalid-config`); anything uncaught is a 500
(`internal`) carrying the raw error message. Handlers never format their own
error responses: they throw, and `route`'s catch block is the single place
that translates.

**Events.** `EventBus` is fed by the reconciler, prober, and registry as state
changes; `Api` subscribes once in `listen` and republishes every event to the
`events` WebSocket topic verbatim (`DaemonEvent` in the protocol types, the
same union the TUI renders from). A newly connected socket gets a `snapshot`
event synthesized from `reconciler.snapshot()` before anything else, so a
client never has to make a separate REST call just to get its first paint.

**Versioning.** `GET /v1/info` returns `protocol` (`PROTOCOL_VERSION` in
`src/shared/version.ts`), bumped on any breaking change to this contract. The
client's `info()` handshake throws `ProtocolMismatchError` on a mismatch
instead of sending requests a stale or newer daemon can't parse.

The full endpoint table lives in the [CLI reference](../cli-reference.md#socket-api-the-contract-behind-every-command);
this file is about how the dispatcher is put together, not what each route
does.
