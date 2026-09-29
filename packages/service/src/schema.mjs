import { z } from 'zod'
const identity = z.string().uuid()
import { Definition } from 'dsh-workbench-agent-studio-runtime/schema'
export { Definition }
export const ConnectorSnapshot = z.object({version:z.literal('1.6.5'),actions:z.array(z.object({action:z.record(z.string(),z.unknown()),connection:z.object({id:z.string(),service:z.string(),alias:z.string(),label:z.string(),accountId:z.string(),authType:z.string(),scopes:z.array(z.string())}).optional()}))})
export const Document = z.object({ runtime:z.object({source:z.string(),toolPresentation:z.enum(['native','ptc','both']).optional()}).optional(), connectorSnapshot: ConnectorSnapshot.optional(), readOnly: z.boolean().optional(), baseYaml: z.string().optional(), sourcePreset: z.string().optional(), id: identity, revision: z.number().int().positive(), definition: Definition, createdAt: z.string(), updatedAt: z.string(), deleted: z.boolean().optional() })
export const Tool = z.object({ id: z.string().min(1), name: z.string().min(1), arguments: z.string().max(200000), result: z.string().max(1000000).optional(), error: z.boolean().optional() }).strict()
export const Message = z.object({ id: z.string().min(1), role: z.enum(['user', 'assistant']), text: z.string().max(1000000), tools: z.array(Tool).optional(), thinking: z.string().optional() }).strict()
export const RunInput = z.object({ id: identity, revision: z.number().int().positive(), cwd: z.string().min(1), messages: z.array(Message).min(1).max(500), mode: z.enum(['model-only', 'tool-batch', 'react']), maxSteps: z.number().int().min(1).max(30).default(10) }).strict()
export const Run = z.object({ request:z.object({system:z.string(),context:z.string(),tools:z.array(z.record(z.string(),z.unknown()))}).optional(), id: identity, sessionId: identity, document: Document, cwd: z.string(), mode: RunInput.shape.mode, maxSteps: z.number(), input: z.array(Message), output: z.array(Message), status: z.enum(['preparing','running','waiting-tools','succeeded','failed','cancelled','interrupted']), reason: z.string().optional(), error: z.string().optional(), createdAt: z.string(), finishedAt: z.string().optional(), usage: z.array(z.record(z.string(), z.unknown())).default([]) })
export const Evaluation = z.object({ id: identity, leftRunId: identity, rightRunId: identity, verdict: z.enum(['leftBetter','rightBetter','tie','pass','fail']), note: z.string().max(30000), rubric: z.object({name:z.string().min(1).max(80),criteria:z.array(z.object({id:z.string(),name:z.string().min(1).max(80),description:z.string().max(240)})).min(2).max(6)}).optional(), scores:z.array(z.object({criterionId:z.string(),left:z.number().int().min(1).max(5),right:z.number().int().min(1).max(5)})).optional(), dimensions: z.array(z.object({name:z.string().trim().min(1).max(120),left:z.number().int().min(1).max(5).nullable(),right:z.number().int().min(1).max(5).nullable()}).strict()).max(30).default([]), updatedAt: z.string() })
export const Receipt = z.object({ sessionId:identity.optional(), id: identity, runId: identity, callId: z.string(), status: z.enum(['running','succeeded','failed','interrupted']), output: Tool.optional(), arguments: z.string().optional() })
export const Prompt = z.object({ id: identity, agentId: identity, instruction: z.string().default(''), document: Document.optional(), context: z.string(), original: z.string(), candidate: z.string(), status: z.enum(['running','succeeded','failed','cancelled','interrupted']), error: z.string().optional(), createdAt: z.string() })
export function error(message, code = 'INVALID_REQUEST') { return Object.assign(new Error(message), { code }) }
export function validateInput(messages) {
  const ids = new Set()
  for (const m of messages) {
    for (const t of m.tools ?? []) {
      if (m.role !== 'assistant') throw error('Tool calls belong to assistant messages')
      if (ids.has(t.id)) throw error('Duplicate historical tool call ID')
      ids.add(t.id)
      if (t.result === undefined) throw error('Complete or remove pending tool results before continuing')
    }
  }
  if (!messages.some(m => m.text.trim() || m.tools?.length)) throw error('Input is empty')
}
