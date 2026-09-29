import { createStudioApi } from './protocol.mjs'
/** Publish only after recovery, withdraw consumers before closing data and jobs. */
export async function mountStudio(ctx, owner) {
 await ctx.effect(async () => {
  let withdraw
  try {
   await owner.initialize()
   withdraw = ctx.provide('agentStudio', createStudioApi(owner))
  } catch (error) {
   await owner.dispose()
   throw error
  }
  return async () => {
   await withdraw()
   await owner.dispose()
  }
 })
}
