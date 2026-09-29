/** Typed namespace for trial history and user-authored comparisons. */
import type { HistoryKey } from './locales/history.ts'
export { en, zh } from './locales/history.ts'
export type { HistoryKey } from './locales/history.ts'

/** Locale namespace registered by the Agent Studio client plugin. */
export const HISTORY_NS = 'agent-studio-history'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'agent-studio-history': HistoryKey }
}
