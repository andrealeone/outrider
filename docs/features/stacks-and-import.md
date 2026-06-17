# Stacks and import

An existing `process-compose.yaml` imports and runs without edits. Import binds
a **stack**: the set of processes from one compose file (plus its discovered
`process-compose.override.yaml`), tracked together under a stack name.

From the dashboard, `m` asks for a path — a compose file or a directory to
discover one in — and runs a **dry run first**: it parses, merges, templates,
expands environment, and validates, then shows the resulting processes, the
resolved start order by dependency level, and any compatibility warnings.
Nothing touches the registry until you confirm.

Re-importing the same stack refreshes it in place: new processes appear,
removed ones are stopped and dropped, and the desired state of the survivors is
preserved. The merged content is hashed so drift against the source file is
detectable.

Stack members are file-owned, so they are not edited in the dashboard — change
the compose file and re-import. Deleting a member offers to remove the whole
stack instead, because a partial stack would diverge from its source.

Compatibility with process-compose is tracked in the
[compatibility report](../compatibility-report.md); the recognised keys and the
outrider extensions are in the [config schema](../config-schema.md).
