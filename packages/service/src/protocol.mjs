/** Public operations shared by Host consumers and the HTTP adapter. */
export const STUDIO_API_VERSION = 1
export const STUDIO_METHODS = Object.freeze(["bootstrap", "readPreset", "copyPreset", "receipts", "records", "connectorStatus", "connectorProviders", "connectorActions", "connectorRefresh", "connectorRestart", "connectorSelect", "connectorConsole", "models", "catalog", "create", "save", "copy", "delete", "export", "runPreset", "conversationPreset", "run", "getRun", "stop", "history", "executeTool", "evaluate", "conversation", "prompt", "getPrompt", "stopPrompt"])
export function invokeStudioMethod(api, method, args = {}) {
 if (typeof method !== 'string' || !STUDIO_METHODS.includes(method)) {
  throw Object.assign(new Error('Unknown Studio operation'), {code:'INVALID_REQUEST'})
 }
 if (api.apiVersion !== STUDIO_API_VERSION) throw new Error('Unsupported Studio API version')
 return api[method](args)
}
export function createStudioApi(owner) {
 return Object.freeze({apiVersion:STUDIO_API_VERSION,...Object.fromEntries(STUDIO_METHODS.map(method=>[method,args=>owner.dispatch(method,args)]))})
}
