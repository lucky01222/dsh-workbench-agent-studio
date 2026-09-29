/** Prompt candidates stay separate from Agent drafts until the user applies them. */
const randomUUID = () => crypto.randomUUID()
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { StudioPromptId, StudioPromptRequest, StudioPromptRun } from '@deepseek-ai/dsh-api-agent-studio-controller/types'
import type { AgentStudioController, EditorSnapshot } from './controller.ts'

/** Three remote operations used by the authoring panel. */
export interface PromptApi {
  start(request: StudioPromptRequest): Promise<StudioPromptRun>
  get(id: StudioPromptId): Promise<StudioPromptRun>
  stop(id: StudioPromptId): Promise<StudioPromptRun>
}
/** One per-Agent authoring view; streaming never mutates the editable prompt. */
export interface PromptSnapshot {
  open: boolean
  instruction: string
  model: string
  candidate: string
  preview: string
  base: string
  capabilities: string
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error: string | null
  applied: string | null
  previous: string | null
}
const empty = (): PromptSnapshot => ({ open: false, instruction: '', model: '', candidate: '', preview: '', base: '', capabilities: '', status: 'idle', error: null, applied: null, previous: null })
const capabilities = (editor: EditorSnapshot) => JSON.stringify([editor.draft?.tools, editor.draft?.skills])
/** Native controller subscribes to selection changes and rejects late authoring responses. */
export class PromptController {
  private readonly state = createSnapshotStore<PromptSnapshot>(empty())
  private agentId: string | undefined
  private pending: StudioPromptId | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private disposed = false
  private readonly unsubscribe
  constructor(private readonly editor: AgentStudioController, private readonly api: PromptApi) {
    this.agentId = editor.getSnapshot().document?.agentPreset
    this.unsubscribe = editor.subscribe(() => {
      const next = editor.getSnapshot().document?.agentPreset
      if (this.agentId === next) return
      this.cancelPending(); this.agentId = next; this.state.set(empty())
    })
  }
  /** Read panel state. @returns Current immutable snapshot. */
  getSnapshot = (): PromptSnapshot => this.state.getSnapshot()
  /** Subscribe to panel changes. @param listener - Render observer. @returns Unsubscribe callback. */
  subscribe = (listener: () => void): (() => void) => this.state.subscribe(listener)
  private publish(patch: Partial<PromptSnapshot>) { if (!this.disposed) this.state.set({ ...this.getSnapshot(), ...patch }) }
  /** Update only authoring inputs; Agent configuration is unchanged.
   * @param patch - Input and panel visibility fields.
   */
  change = (patch: Partial<Pick<PromptSnapshot, 'open' | 'instruction' | 'model'>>): void => { this.publish(patch) }
  /** Whether selected capabilities have changed since this candidate was generated. @returns Context mismatch. */
  capabilitiesChanged = (): boolean => !!this.getSnapshot().candidate
    && capabilities(this.editor.getSnapshot()) !== this.getSnapshot().capabilities
  /** Create or refine a candidate from the latest unsaved configuration. */
  start = async (): Promise<void> => {
    const state = this.getSnapshot(), editor = this.editor.getSnapshot()
    if (state.status === 'running' || !state.instruction.trim() || !editor.draft || !editor.document || editor.document.readOnly) return
    let model: { provider: string; model: string } | undefined
    if (state.model) model = JSON.parse(state.model) as { provider: string; model: string }
    else if (editor.draft.modelSelection === 'global') model = editor.models?.default
    else if (editor.draft.provider && editor.draft.model) model = editor.draft
    if (!model?.provider || !model.model) { this.publish({ error: 'model-required' }); return }
    const id = randomUUID() as StudioPromptId, generation = ++this.generation
    this.pending = id
    const base = editor.draft.systemPrompt, selected = capabilities(editor)
    const original = state.candidate && !this.capabilitiesChanged() && state.base === base ? state.candidate : base
    this.publish({ status: 'running', preview: '', error: null })
    const accept = (run: StudioPromptRun) => {
      if (this.disposed || generation !== this.generation) return
      if (run.status === 'running') {
        this.publish({ preview: run.text })
        this.timer = setTimeout(() => { void this.api.get(id).then(accept).catch(fail) }, 300)
      } else {
        this.pending = undefined
        this.publish({ status: run.status === 'interrupted' ? 'failed' : run.status,
          ...(run.status === 'succeeded' ? { candidate: run.text, base, capabilities: selected, instruction: '', applied: null } : {}),
          preview: '', error: run.status === 'failed' || run.status === 'interrupted' ? run.error ?? 'interrupted' : null })
      }
    }
    const fail = (error: unknown) => {
      if (this.disposed || generation !== this.generation) return
      this.pending = undefined
      void this.api.stop(id).catch(() => {}) // A disconnected request must not keep spending in the background.
      this.publish({ status: 'failed', preview: '', error: error instanceof Error ? error.message : String(error) })
    }
    try {
      const run = await this.api.start({ id, agentPreset: editor.document.agentPreset, cwd: editor.cwd,
        instruction: state.instruction, original, tools: [...editor.draft.tools], skills: [...editor.draft.skills],
        model: { provider: model.provider, model: model.model } })
      if (generation !== this.generation) { void this.api.stop(id).catch(() => {}); return }
      accept(run)
    } catch (error) { fail(error) }
  }
  private cancelPending() {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    const id = this.pending; this.pending = undefined
    if (id) void this.api.stop(id).catch(() => {}) // UI ownership is already released; the Host also enforces a deadline.
  }
  /** Stop generation while keeping both the original and any earlier complete candidate. */
  stop = (): void => { this.cancelPending(); this.publish({ status: 'cancelled', preview: '', error: null }) }
  /** Discard the candidate and return to the original editor. */
  discard = (): void => { this.cancelPending(); this.state.set(empty()) }
  /** Apply only a complete candidate against the exact prompt the user reviewed.
   * @param reviewedPrompt - Current original displayed in the comparison. @returns Whether replacement occurred.
   */
  apply = (reviewedPrompt: string): boolean => {
    const state = this.getSnapshot(), editor = this.editor.getSnapshot()
    if (!state.candidate || state.status === 'running' || editor.document?.readOnly || !editor.draft || this.capabilitiesChanged()
      || editor.draft.systemPrompt !== reviewedPrompt) return false
    this.editor.change({ systemPrompt: state.candidate })
    this.publish({ previous: reviewedPrompt, applied: state.candidate, base: state.candidate, open: false })
    return true
  }
  /** Restore only while the applied text is still intact, preserving subsequent manual edits. */
  restore = (): void => {
    const state = this.getSnapshot()
    if (state.previous === null || state.applied !== this.editor.getSnapshot().draft?.systemPrompt) return
    this.editor.change({ systemPrompt: state.previous })
    this.publish({ previous: null, applied: null, base: state.previous, candidate: '', status: 'idle' })
  }
  /** Cancel callbacks and detach from the Agent editor. */
  dispose(): void { this.cancelPending(); this.disposed = true; this.unsubscribe() }
}
