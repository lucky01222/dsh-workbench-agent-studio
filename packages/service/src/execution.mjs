import { randomUUID } from 'node:crypto'
/** Pure finite driver. Official services supply model and guarded tool adapters. */
export async function executeFinite({ input, mode, maxSteps, signal, stream, execute, publish }) {
  const output = [], usage = []
  const human = new Set(['ask_user_question', 'ask_user', 'request_user_input', 'spawn_agent'])
  for (let step = 0; step < maxSteps; step++) {
    signal.throwIfAborted()
    const message = { id: randomUUID(), role: 'assistant', text: '', tools: [] }
    output.push(message)
    const blocks = new Map(), textBlocks = new Map(), reasoningBlocks = new Map(); let finish
    for await (const chunk of stream([...input, ...output.slice(0, -1)])) {
      signal.throwIfAborted()
      if (chunk.type === 'text-delta') textBlocks.set(chunk.index, (textBlocks.get(chunk.index) ?? '') + chunk.text)
      if (chunk.type === 'reasoning-delta') reasoningBlocks.set(chunk.index, (reasoningBlocks.get(chunk.index) ?? '') + chunk.text)
      if (chunk.type === 'block-end' && chunk.block.type === 'text') textBlocks.set(chunk.index, chunk.block.text)
      if (chunk.type === 'block-end' && chunk.block.type === 'reasoning') reasoningBlocks.set(chunk.index, chunk.block.text)
      message.text = [...textBlocks.entries()].sort((a,b) => a[0]-b[0]).map(([,text]) => text).join('')
      if (reasoningBlocks.size) message.thinking = [...reasoningBlocks.values()].join('')
      if (chunk.type === 'tool-call-delta') {
        const previous = blocks.get(chunk.index) ?? { id: chunk.id, name: '', arguments: '' }
        blocks.set(chunk.index, { ...previous, ...(chunk.name ? { name: chunk.name } : {}), arguments: previous.arguments + chunk.argumentsDelta })
        message.tools = [...blocks.values()]
      }
      if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
        blocks.set(chunk.index, { id: chunk.block.id, name: chunk.block.name, arguments: chunk.block.arguments })
        message.tools = [...blocks.values()]
      }
      if (chunk.type === 'usage') usage.push(chunk.usage)
      if (chunk.type === 'finish') finish = chunk.reason
      await publish(structuredClone(output), structuredClone(usage))
    }
    if (!finish) throw new Error('Model stream ended without a finish event')
    if (finish.kind === 'error') throw new Error(finish.failure?.message ?? 'Model request failed')
    if (finish.kind === 'aborted') { signal.throwIfAborted(); throw new Error('Model request aborted') }
    if (finish.kind === 'max-tokens') return { output, usage, status: 'succeeded', reason: 'max-tokens' }
    if (!message.tools.length) return { output, usage, status: 'succeeded', reason: 'completed' }
    if (mode === 'model-only') return { output, usage, status: 'waiting-tools', reason: 'model-only' }
    if (message.tools.some(t => human.has(t.name))) return { output, usage, status: 'waiting-tools', reason: 'human-input' }
    for (const tool of message.tools) {
      signal.throwIfAborted()
      const result = await execute(tool)
      tool.result = result.text; tool.error = result.error
      await publish(structuredClone(output), structuredClone(usage))
    }
    if (mode === 'tool-batch') return { output, usage, status: 'succeeded', reason: 'tool-batch' }
  }
  return { output, usage, status: 'succeeded', reason: 'step-limit' }
}
