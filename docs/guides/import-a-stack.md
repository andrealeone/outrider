# Guide: import a stack

Any existing `process-compose.yaml` imports as-is — that's the compatibility
contract.

1. `outrider` to open the dashboard, then `m`.
2. Enter the path to the compose file or its directory (auto-discovery
   follows the upstream order; an `*.override.*` sibling merges
   automatically). Press enter.
3. Read the dry-run report: the stack name, the merged process list, the
   resolved start order, and any compatibility warnings (deferred features,
   unknown keys, persistent-mode notes). Nothing has been registered yet.
4. Press `y` to import. The stack's services appear in the dashboard with
   desired state `down`.
5. Select services and press `space` to bring them up — dependencies come up
   with them, gated on their `depends_on` conditions. Press `A` on the ones
   that should start at boot.

Re-importing the same path refreshes the stack: changed configs apply on the
next (re)start, processes that left the file are stopped and removed, and
desired/autostart flags survive. The registry remembers the source path and a
content hash, so drift between the file and the imported stack is detectable.

From a script, the same flow is one call:

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/import -X POST -d '{"path": "/path/to/project", "dryRun": true}'
```
