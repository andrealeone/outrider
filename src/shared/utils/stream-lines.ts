/** Iterate a byte stream as decoded lines, flushing any unterminated tail. */
export async function* streamLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) yield line
  }
  pending += decoder.decode()
  if (pending !== '') yield pending
}
