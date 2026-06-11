// Double-brace vars templating covering the common Go-template cases:
// dotted lookups like {{.VERSION}} or {{ .app.port }}. Anything richer
// (pipes, conditionals, ranges) is a hard error naming the expression,
// per the cuts policy for Go-template parity.

const EXPRESSION = /\{\{([^}]*)\}\}/g
const DOTTED_LOOKUP = /^\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/

export class TemplateError extends Error {
  constructor(
    readonly expression: string,
    readonly reason: string,
    context: string,
  ) {
    super(`template expression {{${expression}}} in ${context}: ${reason}`)
  }
}

export const renderTemplate = (
  input: string,
  vars: Record<string, unknown>,
  context: string,
): string =>
  input.replace(EXPRESSION, (_, rawExpr: string) => {
    const expr = rawExpr.trim()
    const match = DOTTED_LOOKUP.exec(expr)
    if (!match) {
      throw new TemplateError(
        expr,
        'only simple dotted lookups like {{.NAME}} are supported',
        context,
      )
    }
    let value: unknown = vars
    for (const part of (match[1] as string).split('.')) {
      if (typeof value !== 'object' || value === null || !(part in value)) {
        throw new TemplateError(expr, `"${part}" is not defined in vars`, context)
      }
      value = (value as Record<string, unknown>)[part]
    }
    if (typeof value === 'object') {
      throw new TemplateError(expr, 'resolves to a map, not a printable value', context)
    }
    return String(value as string | number | boolean)
  })
