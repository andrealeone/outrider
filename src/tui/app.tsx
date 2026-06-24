import { render, useApp, useStdout } from 'ink'
import React, { useState } from 'react'

import { Dashboard, type View } from './components/dashboard'
import { AddService } from './components/add-service'
import { DetailView } from './components/detail-view'
import { ImportStack } from './components/import-stack'
import { LogsView } from './components/logs-view'
import { useFrameClock } from './frame-clock'
import { useDaemon } from './use-daemon'

const App = () => {
  const daemon = useDaemon()
  const frame = useFrameClock(150)
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [view, setView] = useState<View>({ name: 'dashboard' })
  // Held here, not in Dashboard: opening a sub-view (edit, detail, logs)
  // unmounts the dashboard, so its cursor must outlive it to be restored.
  const [selected, setSelected] = useState(0)

  const rows = stdout.rows || 24
  const width = stdout.columns || 80
  const back = (): void => {
    setView({ name: 'dashboard' })
  }

  switch (view.name) {
    case 'logs':
      return (
        <LogsView daemon={daemon} id={view.id} rows={rows} width={width} active onBack={back} />
      )
    case 'detail':
      return (
        <DetailView
          state={daemon.services.find((s) => s.entry.id === view.id)}
          rows={rows}
          active
          onBack={back}
          portless={daemon.daemon?.portless ?? true}
        />
      )
    case 'add':
      return <AddService daemon={daemon} active edit={view.edit} onDone={back} />
    case 'import':
      return <ImportStack daemon={daemon} active onDone={back} />
    case 'dashboard':
    default:
      return (
        <Dashboard
          daemon={daemon}
          rows={rows}
          width={width}
          frame={frame}
          active
          selected={selected}
          onSelect={setSelected}
          onOpen={setView}
          onQuit={exit}
        />
      )
  }
}

/**
 * The TUI is a thin client over the socket: it never spawns or supervises
 * processes itself (the daemon switch excepted). Closing it changes nothing
 * about running services.
 */
export const runTui = async (): Promise<void> => {
  if (!process.stdout.isTTY) {
    // Dumb terminal or piped output: degrade to a plain text snapshot.
    const { run } = await import('../cli/commands/state')
    await run()
    return
  }
  const app = render(<App />, { exitOnCtrlC: true })
  await app.waitUntilExit()
}
