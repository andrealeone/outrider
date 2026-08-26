# Registry

`src/daemon/registry.ts` holds the desired model: a single flat map of
`ServiceEntry` records, keyed by each service's own `name`, whether it came
from an imported compose file or was defined standalone in the TUI. Naming is
flat: every service's id is just its name, with upstream namespaces kept as a
filter dimension. Each entry carries desired state (up/down) and an autostart
flag honoured at daemon boot.

An imported entry additionally carries `sourceTag` (the import batch it came
from, linked back to its source path and a content hash so drift is
detectable and re-import is cheap) and `sourceProcess` (the original
process-compose key, kept so re-import can still correlate the entry after
the user has renamed it). Both fields are absent on standalone entries.

Every mutation persists through the state store (atomic temp-file → fsync →
rename on `registry.json`) and announces itself on the event bus. The daemon
is the single writer, which is what makes a database unnecessary; the TUI's
offline mode reads the file directly, safe precisely because the daemon is
not running. `bun:sqlite` remains the documented fallback if history querying
ever outgrows a linear journal scan; the store sits behind a small class so
the swap would be local.

Import merges global `environment`, logger defaults, and `ordered_shutdown`
into each entry, preserves desired/autostart across re-imports, and only
stops and drops processes that left the source file once their removal is
explicitly approved in the import wizard. Route uniqueness is enforced
**globally** across every entry regardless of origin, failing with both
claimants named.
