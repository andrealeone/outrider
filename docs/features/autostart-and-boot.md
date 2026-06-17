# Autostart and boot

Every service carries two independent facts: its **desired state** (up or down)
and an **autostart** flag. Together they decide what comes back after the daemon
restarts or the machine reboots.

- Desired state is what you want _now_. Toggling a service in the dashboard, or
  `outrider start`/`stop`, sets it.
- Autostart marks a service to be resumed at daemon boot.

`outrider off` stops processes but leaves desired state untouched. At the next
`outrider on` — or after a reboot, since `on` installs a launchd agent (macOS)
or systemd user unit (Linux) that starts the daemon — every service that is
both `autostart` _and_ desired `up` is brought back, in dependency order.

So a service starts at boot only when both are true: it was wanted up, and it
opted into autostart. A service you stopped on purpose stays stopped; a
scratch service you never marked autostart does not resurrect itself.

Restart counters persist across daemon restarts too, rebuilt from the journal,
so the dashboard's restart column stays meaningful over a daemon's lifetime.

Toggle autostart from the dashboard with `A`; see
[desired state, autostart, and reboots](../usage.md) for the day-to-day flow.
