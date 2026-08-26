# Standalone services

Not everything you run lives in a `process-compose.yaml`. A standalone service
is registered directly with the daemon and persisted in the registry with no
backing file, handy for a one-off dev server, a local proxy, or a tool you
want supervised without authoring a compose file for it.

Add one from the dashboard with `a`: name, command, working directory, an
optional [route](native-routing.md), an optional alias port, optional
[tags](service-tags.md), a restart policy, and the autostart flag. The form
validates live against the daemon, so name collisions and malformed routes
surface before you save.

Standalone services are full citizens: they start, stop, restart, scale, route,
and autostart exactly like imported ones. The only difference is provenance:
the registry _is_ their source of truth, so they are edited in place (`e`) and
removed cleanly (`x`), with no file to drift out of sync.

Renaming is supported: editing the name field moves the entry to its new id,
and a live service restarts to pick up the change.

See also: [importing processes](importing-processes.md) for the file-backed path.
