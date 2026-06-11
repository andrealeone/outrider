import type { ConfigWarning } from '../../shared/types/process-compose'

// envsubst-style expansion. Supported: $$ (literal $), ${VAR}, $VAR.
// The exotic envsubst function forms (defaults, case conversion, pattern
// replacement) are recognised and left untouched with a named warning,
// per the cuts policy: never a silent ignore, never a crash.
const TOKEN = /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|\$\{[^}]*\}/g

export interface ExpandResult {
  value: string
  warnings: ConfigWarning[]
}

export const expandEnv = (input: string, env: Record<string, string | undefined>): ExpandResult => {
  const warnings: ConfigWarning[] = []
  const value = input.replace(
    TOKEN,
    (match, braced: string | undefined, bare: string | undefined) => {
      if (match === '$$') return '$'
      const name = braced ?? bare
      if (name !== undefined) return env[name] ?? ''
      warnings.push({
        code: 'deferred-envsubst-form',
        message: `envsubst expression "${match}" uses an unsupported function form; only $VAR, \${VAR} and $$ are expanded — the text was left as written`,
      })
      return match
    },
  )
  return { value, warnings }
}
