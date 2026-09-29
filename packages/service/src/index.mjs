import { StudioService } from './service.mjs'
import { mountStudio } from './lifecycle.mjs'
export const inject = ['llm', 'tools', 'skills', 'agents', 'agentPresets', 'storageDomain', 'sessionController', 'workspaceRegistry', 'systemPrompt']
export async function apply(ctx) { await mountStudio(ctx, new StudioService(ctx)) }
