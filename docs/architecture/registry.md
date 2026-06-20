# Registry

`src/daemon/registry.ts` holds the desired model: **stacks** (imported from a
compose file, linked to their source by path and content hash so drift is
detectable and re-import is cheap) and **standalone services** (defined in
the TUI with no backing file). Naming is hierarchical: `stack/process` for
stack members, a plain name for standalone, with upstream namespaces kept as
a filter dimension. Each entry carries desired state (up/down) and an
autostart flag honoured at daemon boot.

Every mutation persists through the state store (atomic temp-file → fsync →
rename on `registry.json`) and announces itself on the event bus. The daemon
is the single writer, which is what makes a database unnecessary; the TUI's
offline mode reads the file directly, safe precisely because the daemon is
not running. `bun:sqlite` remains the documented fallback if history querying
ever outgrows a linear journal scan; the store sits behind a small class so
the swap would be local.

Import merges global `environment`, logger defaults, and `ordered_shutdown`
into each entry, preserves desired/autostart across re-imports, stops and
drops processes that left the stack, and enforces **global route uniqueness**
across stacks and standalone services, failing with both claimants named.
