import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { daemonLogPath, dataDir } from './utils/paths'

const LAUNCHD_LABEL = 'dev.outrider.daemon'
const launchdPlist = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
const systemdUnit = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
  'systemd',
  'user',
  'outrider.service',
)

/** The daemon is this same binary invoked with `daemon run`. */
const daemonArgv = (): string[] => {
  const compiled = Bun.main.startsWith('/$bunfs')
  return compiled
    ? [process.execPath, 'daemon', 'run']
    : [process.execPath, 'run', Bun.main, 'daemon', 'run']
}

const quiet = (command: string): boolean => {
  try {
    execSync(command, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const launchdTemplate = (argv: string[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argv.map((a) => `    <string>${a}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${daemonLogPath}</string>
  <key>StandardErrorPath</key><string>${daemonLogPath}</string>
</dict>
</plist>
`

const systemdTemplate = (argv: string[]): string => `[Unit]
Description=outrider service daemon

[Service]
ExecStart=${argv.join(' ')}
Restart=on-failure
StandardOutput=append:${daemonLogPath}
StandardError=append:${daemonLogPath}

[Install]
WantedBy=default.target
`

/** Write the launchd agent / systemd user unit pointing at this binary. */
export const installUnit = (): void => {
  mkdirSync(dataDir, { recursive: true })
  const argv = daemonArgv()
  if (process.platform === 'darwin') {
    mkdirSync(dirname(launchdPlist), { recursive: true })
    writeFileSync(launchdPlist, launchdTemplate(argv))
  } else {
    mkdirSync(dirname(systemdUnit), { recursive: true })
    writeFileSync(systemdUnit, systemdTemplate(argv))
    quiet('systemctl --user daemon-reload')
  }
}

/** Start the daemon now (through the unit, with a direct-spawn fallback). */
export const startUnit = (): void => {
  const started =
    process.platform === 'darwin'
      ? quiet(`launchctl bootstrap gui/${process.getuid?.() ?? 501} ${launchdPlist}`) ||
        quiet(`launchctl kickstart gui/${process.getuid?.() ?? 501}/${LAUNCHD_LABEL}`)
      : quiet('systemctl --user enable --now outrider.service')
  if (!started) {
    // No service manager available (containers, CI): run detached instead.
    Bun.spawn({ cmd: daemonArgv(), stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }).unref()
  }
}

/** Stop the daemon via its unit and disable start at boot. */
export const uninstallUnit = (): void => {
  if (process.platform === 'darwin') {
    quiet(`launchctl bootout gui/${process.getuid?.() ?? 501}/${LAUNCHD_LABEL}`)
    if (existsSync(launchdPlist)) unlinkSync(launchdPlist)
  } else {
    quiet('systemctl --user disable --now outrider.service')
    if (existsSync(systemdUnit)) unlinkSync(systemdUnit)
    quiet('systemctl --user daemon-reload')
  }
}
