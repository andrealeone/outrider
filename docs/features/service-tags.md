# Service tags

Tags are free-form labels on a service. They cut across stacks and namespaces,
so you can group whatever belongs together — everything a single repository
needs, every database, every background worker — and act on the group as a
unit.

```bash
outrider start web      # start every service tagged "web"
outrider stop web       # stop them again
```

The argument to `start`/`stop` resolves an exact service id first; that wins
outright. Otherwise the name resolves to the **union** of every stack,
namespace, and tag that bears it — so a name shared by, say, a namespace and a
tag acts on the members of both. A tag matches every service that carries it.
Unknown names fail loudly rather than silently doing nothing. You can pass
several at once:

```bash
outrider start api db cache       # any mix of ids, stacks, namespaces, tags
```

Both commands go through the same daemon `up`/`down` path as the dashboard, so
dependencies are pulled up with the services that need them, and shutdown
honours reverse dependency order where it is requested.

## Quick repository setup

Tag the handful of services a project depends on with the repository's name,
and bringing the project up becomes one command:

```bash
outrider start my-repo
```

That is the intended workflow: tag once, then start and stop the whole set
without remembering which services belong to it.

## Assigning tags

**In the dashboard.** The add/edit form (`a` to add, `e` to edit) has a
**tags** field — comma-separated, e.g. `web, db`. Tags are normalised on save:
trimmed, lowercased, de-duplicated, blanks dropped. On edit, leaving the field
empty clears the service's tags.

**In a compose file.** A process may declare tags with an `x-tags` extension,
either a list or a comma-separated string:

```yaml
processes:
  api:
    command: bun run api.ts
    x-tags: [web, edge]
  db:
    command: postgres
    x-tags: infra, data
```

Like every `x-*` key this is ignored by upstream process-compose, so a tagged
file still runs there unchanged.

## Finding tagged services

Dashboard search (`/`) matches tags as well as service ids, so typing a tag
name filters the table to its members. The detail view (`i`) lists a service's
tags.

## Rules

A tag is letters, digits, and dashes (e.g. `web`, `api-v2`); anything else is
rejected at save time. Tags carry no behaviour of their own — they are purely
a grouping handle for `start`/`stop`, search, and the API's `names` field.
