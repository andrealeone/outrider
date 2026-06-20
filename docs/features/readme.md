# Features

Focused notes on what outrider does, one capability per file. For the broader
picture see the [overview](../architecture/overview.md); for the exact config
keys see the [config schema](../config-schema.md). For a detailed comparison with
[process-compose](https://github.com/F1bonacc1/process-compose), see the
[feature parity document](../architecture/feature-parity.md).

- [Service tags](service-tags.md) — group services and start/stop a whole tag at once
- [Config sync](sync-config.md) — edit services at scale in `~/.config/outrider.yml`
- [Standalone services](standalone-services.md) — registry-native services with no backing file
- [Stacks and import](stacks-and-import.md) — run existing `process-compose.yaml` files unedited
- [portless routing](portless-routing.md) — hostnames instead of memorised ports
- [The dashboard](the-dashboard.md) — the Ink TUI that manages everything
- [Autostart and boot](autostart-and-boot.md) — desired state that survives reboots
