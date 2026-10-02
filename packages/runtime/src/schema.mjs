import { z } from 'zod'
const names = z.array(z.string().min(1)).max(500).refine(v => new Set(v).size === v.length, 'Duplicate capability')
export const PluginBindings = z.record(z.string().min(1).max(240), z.object({
  enabled: z.boolean(), mode: z.enum(['all', 'custom']), tools: names,
}).strict()).refine(v => Object.keys(v).length <= 200, 'Too many plugins')
export const CapabilityResolution = z.object({
  version: z.literal(1), resolvedAt: z.string(), tools: names,
  toolOwners: z.record(z.string(), z.string()).optional(),
  plugins: z.array(z.object({ id: z.string(), mode: z.enum(['all', 'custom']), tools: names, version: z.string().optional() }).strict()),
}).strict()
export const Definition = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(4000),
  modelSelection: z.enum(['unset', 'global', 'explicit']), provider: z.string(), model: z.string(),
  promptMode: z.enum(['literal','template']).default('literal'), connectorBindings: z.record(z.string(),z.string()).default({}),
  reasoningEffort: z.string().optional(), systemPrompt: z.string().max(150000), tools: names, skills: names,
  pluginBindings: PluginBindings.optional(),
}).strict().refine(v => v.skills.length === 0 || v.tools.includes('skill') || v.pluginBindings?.['@deepseek-ai/dsh-tool-skill']?.enabled, 'Selected skills require the skill tool')
