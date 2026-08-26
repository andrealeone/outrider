# Guide: import processes

Any existing `process-compose.yaml` imports as-is; that's the compatibility
contract.

1. `outrider` to open the dashboard, then `m`.
2. Enter the path to the compose file or its directory (auto-discovery
   follows the upstream order; an `*.override.*` sibling merges
   automatically). Press enter.
3. The daemon parses, merges, and validates the file, then hands back one
   page per process for review: name, command, working directory, route,
   alias port, tags, restart policy, and autostart, all editable, the same
   form used for adding or editing a standalone service. Nothing has been
   registered yet.
4. On each page, edit any field you want to change, then move to
   `[approve]` or `[reject]` (up/down or Tab/Shift+Tab between fields,
   PageUp/PageDown to jump to the previous or next process) and press enter
   to record your decision and advance.
5. If a process that was previously imported under this same file has since
   disappeared from it, it gets its own removal page: approve it to delete
   the service from the registry, reject it to leave the service in place.
6. After the last page, a summary shows how many processes will be created,
   updated, or removed, plus any compatibility warnings. Press `y` to apply
   everything at once. Nothing is written until this step.
7. Imported services appear in the dashboard with desired state `down`.
   Select them and press `space` to bring them up, and dependencies come up
   with them, gated on their `depends_on` conditions. Press `A` on the ones
   that should start at boot.

Re-importing the same path refreshes the batch in place: changed
definitions go through the same approval pages, processes that left the file
get a removal page, and desired/autostart flags survive on anything you
approve. The registry remembers the source path and a content hash, so drift
between the file and the imported services is detectable. Every service
imported from the same file shares a **source tag**, so `outrider start
<tag>` still targets the whole batch at once.

From a script, the same flow is two calls: preview, then apply with the
processes you want to approve.

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/import/preview -X POST -d '{"path": "/path/to/project"}'

curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/import/apply -X POST -d '{
    "path": "/path/to/project",
    "sourceTag": "project",
    "approved": [...],
    "removedProcessNames": []
  }'
```
