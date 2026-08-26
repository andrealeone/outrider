# Importing processes

An existing `process-compose.yaml` imports and runs without edits. Import is a
paginated approval wizard: nothing is written to the registry until you
confirm a final summary.

From the dashboard, `m` asks for a path (a compose file or a directory to
discover one in) and runs a **preview first**: it parses, merges, templates,
expands environment, and validates, then hands back one editable page per
process, using the same field editor as adding or editing a standalone
service (name, command, working directory, route, alias port, tags, restart
policy, autostart). Every field, including the name, is editable before you
approve a process. Use up/down (or Tab/Shift+Tab) to move between fields on a
page and PageUp/PageDown to switch between processes; press `enter` on
`[approve]` or `[reject]` to record a decision and move to the next page.
Nothing touches the registry until you reach the summary page and press `y`.

Every import batch carries a **source tag**, an identifier for the compose
file it came from (the old stack name lives on as this tag). Re-importing the
same path refreshes that batch: new processes get their own approval page,
changed ones show the merged definition for review, and processes that were
previously imported under the same source tag but have since disappeared from
the file get a removal page of their own, requiring explicit approval before
they are deleted. Nothing is silently dropped.

A service's `sourceProcess` field (the original process-compose key) is kept
across re-imports so renamed services still correlate correctly with their
source, even though the service's `name` is otherwise freely editable.

Compatibility with process-compose is tracked in the
[compatibility report](../compatibility-report.md); the recognised keys and the
outrider extensions are in the [config schema](../config-schema.md).
