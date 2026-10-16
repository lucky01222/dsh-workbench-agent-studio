import { StudioService } from './service.mjs'
import { mountStudio } from './lifecycle.mjs'
import { provideCreator } from './creator/tools.mjs'
export const inject = ['llm', 'tools', 'skills', 'agents', 'agentPresets', 'storageDomain', 'sessionController', 'workspaceRegistry', 'systemPrompt', 'studioCapabilities']
export async function apply(ctx) { const owner = new StudioService(ctx); await provideCreator(ctx, owner); await mountStudio(ctx, owner) }
