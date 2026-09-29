/** Keep provider-default effort implicit, matching the official session selector. */
export function nextSelection(pending, header, fallback) {
  if (pending) return pending
  if (!header) return fallback
  const { provider, model, reasoningEffort } = header.config
  return { provider, model, ...(reasoningEffort && header.adapterDefaults?.reasoningEffort !== true ? { reasoningEffort } : {}) }
}
