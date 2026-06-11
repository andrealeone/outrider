import { existsSync, readFileSync } from 'node:fs'

import { Client } from '../../shared/client'
import { registryPath } from '../../shared/utils/paths'

export const description = 'dump daemon state as JSON (debugging)'
export const hidden = true

export const run = async (): Promise<void> => {
  const client = new Client()
  if (await client.ping().catch(() => false)) {
    console.log(JSON.stringify(await client.state(), null, 2))
    return
  }
  if (existsSync(registryPath)) {
    console.log(
      JSON.stringify(
        { daemon: null, registry: JSON.parse(readFileSync(registryPath, 'utf8')) },
        null,
        2,
      ),
    )
    return
  }
  console.log(JSON.stringify({ daemon: null, registry: null }, null, 2))
}
