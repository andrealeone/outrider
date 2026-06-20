# Feature parity with process-compose

outrider is heavily inspired by [process-compose](https://github.com/F1bonacc1/process-compose) and maintains
a high degree of compatibility. This document compares the features of both tools.

## Shared features

Both tools provide the core capabilities needed to manage local development services:

| Feature | outrider | process-compose |
|---------|----------|-----------------|
| **Process execution** | ✓ (parallel/sequential) | ✓ (parallel/sequential) |
| **Dependency management** | ✓ | ✓ |
| **Recovery policies** | ✓ | ✓ |
| **Environment variables** | ✓ (per-process and global) | ✓ (per-process and global) |
| **Logging** | ✓ (per-process and global) | ✓ (per-process and global) |
| **Health checks** | ✓ (liveness and readiness) | ✓ (liveness and readiness) |
| **Terminal UI** | ✓ (Ink-based dashboard) | ✓ (TUI mode) |
| **CLI interface** | ✓ (core + scripting commands) | ✓ (comprehensive CLI) |
| **Configuration merging** | ✓ | ✓ |
| **Namespace support** | ✓ | ✓ |
| **Process replicas** | ✓ | ✓ |
| **Config file format** | ✓ (process-compose.yaml compatible) | ✓ |

## outrider-specific features

Features unique to outrider:

| Feature | Description |
|---------|-------------|
| **System-wide daemon** | A persistent per-user daemon that owns desired state across reboots and terminal sessions |
| **portless integration** | Services answer on hostnames like `api.myapp.localhost` instead of memorized ports |
| **Standalone services** | Registry-native services with no backing configuration file |
| **Global config sync** | Edit services at scale in `~/.config/outrider.yml` across all projects |
| **Service tags** | Group services and start/stop entire tags with one command |
| **Autostart and boot** | Desired state configuration that survives system reboots |
| **JSON socket API** | Modern socket-based API for programmatic control |

## process-compose-specific features

Features unique to process-compose:

| Feature | Description |
|---------|-------------|
| **REST API** | OpenAPI/Swagger interface with optional token authentication for HTTP access |
| **Scheduled execution** | Cron and interval-based process scheduling beyond dependency-driven startup |
| **Dependency graph visualization** | Visual representation of process dependency chains |
| **Interactive process editing** | On-the-fly configuration changes without restarting |
| **MCP Server integration** | Direct integration with AI assistant tools |
| **Process monitoring** | Push notifications for process state changes |
| **Theme customization** | Customizable TUI themes and keyboard shortcuts |
| **Windows support** | Native Windows executable (outrider targets Unix-like systems) |

## Migration path

If you're coming from process-compose, outrider provides a seamless transition:

- **Existing configs**: Drop your `process-compose.yaml` files into outrider's config directory or use the import feature
- **API clients**: If you've built tools against the REST API, outrider's socket API provides equivalent capabilities
- **Service management**: All core process management features translate directly

The main differences are architectural: outrider's system-wide daemon model trades away REST/HTTP API access for persistent desired-state management, portless hostname routing, and config synchronization across your entire development environment.
