/**
 * Row of the built-in “Agent 创建助手” preset. It registers the creator tools on
 * that Agent only, so no other Agent carries their definitions in its context.
 */
export const name = 'studio-creator-tools'
export const inject = ['tools', 'agentStudioCreator']
export function apply(ctx) { for (const tool of ctx.agentStudioCreator.tools()) ctx.tools.register(tool) }
