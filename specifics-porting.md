This document is the implementation brief for **outrider's in-house routing subsystem**, the replacement for its portless integration: it removes the portless CLI dependency and rebuilds the hostname mapping natively, inside the outrider codebase and daemon, never as a separate tool. It maps every routed service from a numeric local port to a stable, evocative hostname such as `api.myapp.localhost`. The point is simple: services found by name, never by number. It is written to be handed to Claude Code inside the outrider repository as the master prompt for this feature: requirements, schematics, and decisions only, no code.

This specification stands on its own yet belongs to the outrider project: it and **outrider: Specifics** ship together as one prompt. Where the two disagree on routing, this one wins: it supersedes the parent's Portless integration section, its portless dependency rows, and its Phase 3 wholesale.

---

### Scope and intent

**One mental model.** A route table with a proxy in front. The registry maps names to ports, the proxy answers on 443 and forwards by hostname, and everything else in this brief is a consequence of keeping that table accurate.

Three departures from portless follow from outrider's shape. The proxy runs **in-process inside the daemon**, never as a separate binary shelled to at arm's length. The **registry is the single source of truth** for routes, replacing portless's file-based state directory handshake. There is **no project-side wrapper**: the supervisor already spawns every child, so port injection and framework quirks happen at spawn time rather than through a CLI shim.

**Compatibility contract.** The x-portless block defined in the outrider brief keeps working unchanged; x-route becomes the native spelling and x-portless remains a permanent alias. Children keep receiving PORTLESS_URL next to OUTRIDER_URL so scripts written against the old integration survive the swap. The hostname policy is inherited untouched: .localhost by default, .test as the alternative, .local refused because it collides with mDNS, and .dev refused because HSTS forces it onto Google's terms. The evocative name this brief mandates is therefore api.myapp.localhost, never api.local.

**Changes to the parent brief.** The Router interface survives as the boundary; only its implementation changes, from shelling out to portless to calling this subsystem. The portless rows in the parent dependency table lapse, the proxy lifecycle duties described there transfer here wholesale, and the supervisor keeps the quirk table duty it already owns. The reserved-name rule borrowed from portless subcommands lapses with the wrapper: any DNS-safe lowercase label is a valid route.

---

### Anatomy of portless

How the original does it, mechanism by mechanism. This section is the reference the compatibility report must check against source.

**Two halves joined by a state directory.** Portless is a run wrapper and a proxy daemon. The wrapper (portless <name> <cmd>) spawns the dev server; the daemon is a reverse proxy that auto-starts on first use. They never speak directly: the wrapper writes routes, PID files, port files, and proxy settings into ~/.portless (overridable via PORTLESS_STATE_DIR), and the proxy reads that state to build its routing table. Settings from the most recent run persist there, so an auto-start after reboot reuses the last port, TLS mode, and TLD set instead of silently reverting to defaults.

**The wrapper picks the port, not the app.** At launch it selects a random free port in the 4000 to 4999 range and hands it to the child through the PORT environment variable, alongside HOST (normally 127.0.0.1), the public PORTLESS_URL, and NODE_EXTRA_CA_CERTS pointing at the local CA so Node children trust proxied HTTPS calls. Frameworks that ignore PORT (Vite, Astro, React Router, Angular, Expo, React Native) get the right --port flag injected into their argv, with a matching --host where needed and bespoke host rules for Expo and React Native. A fixed port can be forced with --app-port, and processes portless does not spawn at all, typically Docker containers, register through portless alias as static routes.

**Registration is just a file write.** Starting an app records hostname to port in the state directory; exiting removes it. Crashed sessions leave orphans, so a prune command scans for and kills them, and --force takes over a route by killing the current owner. Subcommand names (run, get, alias, hosts, list, doctor, trust, clean, prune, proxy, service) are rejected as app names.

**The proxy routes on the Host header.** One daemon listens on 443 by default (HTTPS with HTTP/2), on 80 with --no-tls, or on any custom port. Binding 443 needs privileges, so it auto-elevates with sudo on macOS and Linux and falls back to an unprivileged port when sudo is unavailable. Requests match by exact hostname first; with --wildcard, an unregistered subdomain falls back to its registered parent (tenant1.myapp.localhost reaching the myapp app), and strict matching is the default. Matched requests stream to 127.0.0.1 on the assigned port, WebSocket upgrades included. A frontend dev server proxying to a sibling app without rewriting the Host header would loop through the proxy forever; portless detects this and answers 508 Loop Detected with a pointer to the changeOrigin fix.

**TLS is a private CA plus per-name leaves.** On first HTTPS run it generates a local certificate authority in the state directory and installs it into the system trust store: the security tool on macOS, update-ca-certificates or update-ca-trust on Linux, certutil on Windows. Route hostnames receive leaf certificates signed by that CA, selected per connection through SNI. HTTP/2 is the point of the exercise: browsers cap HTTP/1.1 at six connections per host, which throttles dev servers serving hundreds of unbundled modules, and multiplexing removes the cap. Custom cert and key paths are accepted for mkcert users, trust can be granted later with portless trust, and clean removes state, trust entry, and hosts block together.

**Names resolve three ways.** Chromium and Firefox resolve any .localhost name to 127.0.0.1 natively, no configuration. Safari and custom TLDs such as .test rely on a marked block portless maintains in /etc/hosts, synced automatically on route changes (PORTLESS_SYNC_HOSTS=0 disables it). LAN mode swaps this for mDNS advertising through dns-sd or avahi so physical devices reach name.local, a mode this brief cuts.

**Everything else is wrapper sugar.** Name inference from package.json, git root, or directory, monorepo discovery from workspace manifests, git worktree branch prefixes, turborepo integration, Tailscale and ngrok exposure, and the OS startup service are conveniences of the standalone CLI. A daemon that already owns spawning, naming, and boot needs none of them, which is what makes this reimplementation small.

---

### Architecture

```jsx
browser / probe            https://api.myapp.localhost
      |
+-----|------------------- outrider daemon ------------------+
|  routing proxy (:443, TLS, HTTP/2)                         |
|      |  host header lookup                                 |
|  route table (registry) -- cert authority -- hosts syncer  |
|      |                                                     |
|  supervisor: injects PORT and quirk flags at spawn         |
+------|-----------------------------------------------------+
       |
   service on 127.0.0.1:4123
```

Five parts, one owner. The **route table** lives in the registry and is written only by the daemon. The **proxy engine** terminates TLS and forwards by hostname. The **cert authority** mints the CA and leaf certificates. The **hosts syncer** maintains the /etc/hosts block. The **quirk injector** is a supervisor duty, not a proxy one, exactly as the parent brief assigns it. All of it sits behind the existing Router interface: nothing in cli or tui knows the proxy exists, and the swap is invisible on the wire protocol.

**Privilege boundary.** The daemon never elevates. The two duties that need root, trust store enrolment and the /etc/hosts block, run in the foreground where a sudo prompt can exist: outrider on performs both on first run, and a TUI repair action re-runs them on demand. When the hosts block is stale and rights are absent, the daemon keeps serving, marks the affected routes degraded, and inspect() prescribes the one-line fix.

---

### Domain model and state

Routes are registry entries, written atomically with the rest of registry.json by its single writer, the daemon. A managed route follows its service's **desired state**, not its process lifetime: the hostname registers when the service goes up and deregisters when it goes down, while the port field refreshes at each spawn. A route whose service is not currently running answers 503 naming the service's state, and restart churn therefore never touches the certificate or the hosts block, since re-minting and hosts sync fire only when the hostname set changes.

| Field    | Type              | Notes                                                                                        |
| -------- | ----------------- | -------------------------------------------------------------------------------------------- |
| hostname | string            | Full name, label plus TLD (api.myapp.localhost); globally unique in the registry             |
| kind     | managed or static | Managed routes follow a supervised service; static routes pin a fixed port (the Docker case) |
| service  | string, optional  | Owning service for managed routes, absent for static ones                                    |
| port     | number            | Allocated at spawn for managed routes, declared for static ones                              |

Proxy settings form one further record: listen port (default 443), TLS on or off (default on), the TLD (default localhost), and certificate paths. Persisted in registry.json so a daemon restart reuses the last configuration, mirroring portless's persistence behaviour. Port allocation keeps the upstream 4000 to 4999 random-free convention, so firewall rules and muscle memory survive the migration.

---

### Proxy engine

**node:http2 is the working assumption.** Server-side HTTP/2 and SNI callbacks in Bun.serve remain open feature requests upstream, so the engine is specified against node:http2 behind the engine interface: one TLS listener on the proxy port serving the CA-signed leaf unconditionally. Plain mode drops to HTTP/1.1 on port 80. The Phase R0 spike gives Bun.serve the chance to prove it can take over; the engine swaps only if it does.

**Forwarding is a fetch, upgrades are a splice.** Ordinary requests are re-issued to 127.0.0.1 on the target port with fetch, streaming bodies both ways, rewriting the Host header, and stamping every forward with x-outrider-hop. Upgrade requests (WebSockets, dev-server HMR) bypass fetch entirely: the engine hijacks the raw socket and splices it to a plain TCP connection against the target, forwarding bytes until either side closes.

**Matching is strict and boring.** Exact hostname lookup in the route table; unknown names receive a 404 page listing the registered routes, which doubles as a human route inspector. Wildcard fallback is deferred. Requests arriving with the x-outrider-hop stamp already present are answered with 508 Loop Detected and the changeOrigin explanation, matching upstream behaviour.

**Privileged binding is per-platform, with no self-escalation.** The Mojave exemption covers wildcard binds only, so on macOS the listener binds 0.0.0.0:443 to earn it; a loopback bind on 443 still demands root and is not attempted. Forward targets stay on 127.0.0.1 regardless, so the exposure is the proxy alone, a fact ensureReady() reports plainly. On Linux the daemon tries 443 and, on refusal, falls back to 1355 while outrider on prints the fix: setcap cap_net_bind_service on the binary, or the ip_unprivileged_port_start sysctl. Plain mode follows the same ladder on 80, falling back to 1354. Whenever a fallback port is bound, OUTRIDER_URL, PORTLESS_URL, and the TUI route column all carry the explicit port suffix. A user daemon must never sudo itself, which is a deliberate break from portless.

---

### Certificate authority

**One CA, minted lazily.** Created on the first TLS start: key and self-signed CA certificate in the outrider data directory with user-only permissions. One leaf certificate carries every registered hostname in its SAN list and is re-minted whenever the hostname set changes, never on a mere port refresh, so the listener serves that single, always-current certificate unconditionally and no SNI selection is involved. Re-issue is cheap; the spike must confirm the listener can hot-swap certificates, and if it cannot, the engine restarts its listener on route change.

**openssl does the crypto.** Shelling to the system openssl (LibreSSL on macOS) keeps the dependency table untouched. The two invocation templates, CA once and leaf on change, ship as constants, and ensureReady() verifies openssl presence. A pure-TypeScript X.509 writer is the named upgrade path should a platform without openssl ever matter.

**Trust is granted once, in the foreground.** security add-trusted-cert on macOS, update-ca-certificates or update-ca-trust on Linux, each behind a single sudo prompt that plainly states what is being trusted and why. The prompt belongs to outrider on or a TUI repair action, never to the daemon, which has no terminal to ask from. Declining leaves everything functional behind a browser warning. Children receive NODE_EXTRA_CA_CERTS pointing at the CA file, so probe-over-route and service-to-service calls verify cleanly.

---

### Environment contract and quirks

| Variable                     | Value                                            |
| ---------------------------- | ------------------------------------------------ |
| PORT                         | Ephemeral port the service must bind             |
| HOST                         | 127.0.0.1                                        |
| OUTRIDER_URL                 | Primary public URL (https://api.myapp.localhost) |
| PORTLESS_URL                 | Same value, compatibility alias                  |
| PC_PROC_NAME, PC_REPLICA_NUM | Inherited from the parent brief, unchanged       |
| NODE_EXTRA_CA_CERTS          | Path to the CA certificate when TLS is on        |

The supervisor injects --port and, where needed, --host flags for the frameworks that ignore PORT: Vite, Astro, React Router, Angular, Expo, and React Native, following portless's table. The exact flag set is a volatile fact: lift it from the portless source at implementation time and keep it as one data table in the quirks file, so a new framework is a one-line addition.

---

### Interface surface

The Router interface from the parent brief is the whole public surface. Handlers stay thin shells over it, so the daemon, TUI, and future CLI commands cannot drift apart.

| Method                         | Behaviour                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ensureReady()                  | Confirms listener, certificates, and hosts block; repairs what it can, reports what it cannot                                                                                      |
| register(hostname, port, kind) | Idempotent upsert: adds a route or refreshes the port of an existing one; a hostname-set change re-mints the leaf and queues a hosts sync; fails on conflict naming both claimants |
| unregister(hostname)           | Removes the route and queues the removal of its hosts entry                                                                                                                        |
| list()                         | Routes with kind, target, owning service, and liveness; managed liveness mirrors supervisor state, static liveness is an on-demand TCP dial with a short cache                     |
| inspect()                      | Diagnostic detail: bind status, CA trust, openssl presence, resolution; surfaced by outrider on and the TUI detail view, folded into doctor when that command arrives              |

The config block keeps its three fields, route, framework, and port, under the x-route key with x-portless accepted forever. In the TUI, the dashboard's route column shows the live URL, and the detail view adds certificate and hosts status alongside the inspect() findings; doctor stays parent-brief polish and simply reuses them when it lands.

---

### Dependencies

| Need             | Choice                                                           | Notes                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Listener and TLS | node:http2                                                       | Server-side HTTP/2 and SNI callbacks are still open requests in Bun.serve, so node:http2 is the working assumption; the R0 spike decides whether Bun.serve can take over |
| Upgrade splice   | Bun socket API with node:net primitives                          | Raw byte forwarding for WebSockets and HMR                                                                                                                               |
| Certificates     | System openssl subprocess                                        | No crypto library enters the bundle                                                                                                                                      |
| Trust store      | System tools (security, update-ca-certificates, update-ca-trust) | One sudo prompt, clearly explained                                                                                                                                       |
| Hosts sync       | Direct file write                                                | Marked begin and end block, atomic rewrite, executed by the foreground elevation path                                                                                    |

**Hard rule.** The swap removes portless and adds nothing in its place: the runtime dependency set tightens to ink and react alone. Any addition beyond that requires a written justification in the change that introduces it.

---

### Code constraints and layout

Every constraint from the outrider brief applies unchanged: less code over more, utilities as a folder, types in .d.ts files, kebab-case filenames, file-routed commands, and documentation written alongside the code in /docs.

```jsx
src/daemon/router/
  proxy-engine.ts      listener, forwarding, splice, loop detection
  route-table.ts       registry-backed routes and conflict checks
  cert-authority.ts    CA and leaf minting, trust store calls
  hosts-sync.ts        /etc/hosts marked block
  quirks.ts            framework flag table (consumed by the supervisor)

~/.local/share/outrider/certs/   ca.pem, ca-key.pem, leaf.pem, leaf-key.pem
registry.json                    routes and proxy settings sections
/etc/hosts                       outrider begin/end marked block
```

---

### Implementation plan

Phases R0 to R4 replace Phase 3, routing, in the parent plan. R0 runs alongside the parent's Phase 0 spike, and R1 to R4 slot where Phase 3 sat, ahead of the TUI work.

**Phase R0, spike.** Bind 0.0.0.0:443 unprivileged on macOS, complete a TLS and HTTP/2 handshake through node:http2 with an openssl-minted CA and the multi-SAN leaf, attempt the same through Bun.serve to settle the engine question, hot-swap a certificate, confirm the Host header can be overridden on forwarded requests, and splice one WebSocket echo through a raw socket.

**Phase R1, plain proxy.** Route table in the registry, HTTP forwarding, PORT and URL injection at spawn, the 404 route listing, and the 508 loop guard.

**Phase R2, TLS.** CA creation, trust store enrolment, leaf re-mint on route change, hosts sync, and probe-over-route.

**Phase R3, polish.** Quirk flag injection, ensureReady() repairs and inspect() reporting through on and the TUI, static aliases, and TUI surfacing.

**Phase R4, the swap.** Remove the portless dependency, run golden tests over configs written with x-portless, update /docs, and commit the compatibility report.

**Acceptance bar.** On a clean machine with no portless installed, importing a stack that routes web and api serves https://myapp.localhost and https://api.myapp.localhost over HTTP/2 with a trusted certificate and working WebSockets; an http readiness probe passes through its route; a config using x-portless behaves identically to one using x-route; and the lockfile contains no routing dependency.

---

### Open questions to settle at implementation time

Bun's server-side HTTP/2 maturity decides whether Bun.serve can ever replace node:http2 behind the engine interface. Whether fetch permits overriding the Host header on forwarded requests decides between fetch and a small raw HTTP/1.1 client over Bun sockets. The exact quirk flag list must come from the portless source, alongside line-level confirmation of the state directory layout, the loop detection mechanism, and the SNI strategy described in the anatomy. The Linux 443 story needs a decision between running setcap during outrider on and leaving it to the guidance outrider on prints. Safari resolution should be tested with and without the hosts block. Certificate hot-swap semantics in the listener determine whether route changes are seamless or cost a restart.

---

### What not to build: a cuts discussion

**Cut outright.** LAN and mDNS mode, Tailscale and ngrok sharing, name inference, monorepo and worktree discovery, turborepo integration, the run wrapper and its PORTLESS=0 bypass, portless's own startup service, and prune. The daemon already owns spawning, naming, boot, and orphan cleanup, so each of these duplicates an existing organ. One consequence deserves honesty: the parent brief documented sharing as a portless pass-through, and with portless gone, sharing leaves scope entirely; users point tailscale serve or ngrok at the printed port themselves.

**Defer until demand is real.** Wildcard subdomain fallback, multiple simultaneous TLDs, custom certificate and key paths for mkcert users, and Windows trust enrolment. Each parses today and warns precisely, per the parent rule that every cut feature must still parse.

**Keep despite the temptation.** Static aliases stay, they are the only bridge to processes the daemon does not spawn. Hosts sync stays, it is the Safari and .test fix. Loop detection stays, the 508 is a kindness that saves an evening of debugging. HTTP/2 stays, it is the reason the proxy earns its keep on module-heavy dev servers.
