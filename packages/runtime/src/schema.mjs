import { z } from 'zod'
const names = z.array(z.string().min(1)).max(500).refine(v => new Set(v).size === v.length, 'Duplicate capability')
export const Definition = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(4000),
  modelSelection: z.enum(['unset', 'global', 'explicit']), provider: z.string(), model: z.string(),
  promptMode: z.enum(['literal','template']).default('literal'), connectorBindings: z.record(z.string(),z.string()).default({}),
  reasoningEffort: z.string().optional(), systemPrompt: z.string().max(150000), tools: names, skills: names,
}).strict().refine(v => v.skills.length === 0 || v.tools.includes('skill'), 'Selected skills require the skill tool')
