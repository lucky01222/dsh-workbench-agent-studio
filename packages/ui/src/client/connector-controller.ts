/** Entry-owned external directory state; no unselected schemas enter the browser. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ConnectorStatus,
  ConnectorProvider,
  ConnectorPage,
  ConnectorQuery,
} from '@deepseek-ai/dsh-api-agent-studio-controller/types'
/** Unwrapped, credential-free RPC face. */
export interface ConnectorApi {
  status(): Promise<ConnectorStatus>
  providers(): Promise<ConnectorProvider[]>
  actions(query: ConnectorQuery): Promise<ConnectorPage>
  refresh(): Promise<ConnectorStatus>
  restart(): Promise<ConnectorStatus>
  select(reference: string): Promise<void>
  console(): Promise<string>
}
/** A shared snapshot for the settings tab and the Agent tool picker. */
export interface ConnectorSnapshot {
  status: ConnectorStatus | null
  providers: readonly ConnectorProvider[]
  page: ConnectorPage
  query: ConnectorQuery
  busy: boolean
  loading: boolean
  error: string | null
  selecting: readonly string[]
}
/** Observable controller guards late searches, duplicate lifecycle actions, and disposal. */
export class ConnectorController {
  private readonly state = createSnapshotStore<ConnectorSnapshot>({
    status: null,
    providers: [],
    page: { items: [], total: 0, offset: 0, offline: true },
    query: {},
    busy: false,
    loading: false,
    error: null,
    selecting: [],
  })
  private epoch = 0
  private generation = 0
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private readonly api: ConnectorApi) {}
  /** Read the current immutable catalog state. */
  getSnapshot = () => this.state.getSnapshot()
  /** Subscribe through the framework-owned store. */
  subscribe = (listener: () => void) => this.state.subscribe(listener)
  private publish(patch: Partial<ConnectorSnapshot>) {
    if (!this.disposed) this.state.set({ ...this.getSnapshot(), ...patch })
  }
  private failure(error: unknown) {
    this.publish({ error: error instanceof Error ? error.message : String(error) })
  }
  /** Refresh metadata on opening a surface, or explicitly refresh the upstream directory.
   * @param refresh - Refresh upstream metadata when true.
   */
  async load(refresh = false): Promise<void> {
    if (this.getSnapshot().busy || this.disposed) return
    const epoch = this.epoch
    this.publish({ busy: true, error: null })
    try {
      const status = await (refresh ? this.api.refresh() : this.api.status())
      const providers = await this.api.providers()
      if (epoch !== this.epoch) return
      this.publish({ status, providers })
      await this.search(this.getSnapshot().query)
      if (epoch === this.epoch && status.state === 'starting')
        this.timer = setTimeout(() => {
          void this.load()
        }, 1000)
    } catch (error) {
      if (epoch === this.epoch) this.failure(error)
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false })
    }
  }
  /** Search the full catalog in bounded pages; the last requested query owns the result.
   * @param query - Selected service, search text and page offset.
   */
  async search(query: ConnectorQuery): Promise<void> {
    const generation = ++this.generation
    this.publish({ query, loading: true, error: null })
    try {
      const page = await this.api.actions({ ...query, limit: 50 })
      if (generation === this.generation) this.publish({ page })
    } catch (error) {
      if (generation === this.generation) this.failure(error)
    } finally {
      if (generation === this.generation) this.publish({ loading: false })
    }
  }
  /** Restart the owned service and refresh its state. */
  async restart(): Promise<void> {
    if (this.getSnapshot().busy) return
    const epoch = this.epoch
    this.publish({ busy: true, error: null })
    try {
      const status = await this.api.restart()
      if (epoch === this.epoch) this.publish({ status })
    } catch (error) {
      if (epoch === this.epoch) this.failure(error)
    } finally {
      if (epoch === this.epoch) {
        this.publish({ busy: false })
        await this.load()
      }
    }
  }
  /** Validate one selected schema before the caller changes an Agent draft.
   * @param reference - Capability to validate.
   * @returns False for duplicate, failed or retired selections.
   */
  async select(reference: string): Promise<boolean> {
    if (this.getSnapshot().selecting.includes(reference)) return false
    const epoch = this.epoch
    this.publish({ selecting: [...this.getSnapshot().selecting, reference], error: null })
    try {
      await this.api.select(reference)
      return !this.disposed && epoch === this.epoch
    } catch (error) {
      if (epoch === this.epoch) this.failure(error)
      return false
    } finally {
      if (epoch === this.epoch) this.publish({ selecting: this.getSnapshot().selecting.filter(id => id !== reference) })
    }
  }
  /** Open the official console from a direct user click, preserving browser popup rules. */
  openConsole(): void {
    const epoch = this.epoch
    const windowRef = window.open('about:blank', '_blank')
    if (windowRef) windowRef.opener = null
    void this.api
      .console()
      .then((url) => {
        if (epoch !== this.epoch || this.disposed) {
          windowRef?.close()
          return
        }
        if (windowRef) windowRef.location.href = url
        else this.publish({ error: 'connectorPopupBlocked' })
      })
      .catch((error: unknown) => {
        windowRef?.close()
        this.failure(error)
      })
  }
  /** Forget the previous Host's accounts, queries and pending selections on reconnect. */
  reset(): void {
    this.epoch++
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.publish({
      status: null,
      providers: [],
      page: { items: [], total: 0, offset: 0, offline: true },
      query: {},
      busy: false,
      loading: false,
      error: null,
      selecting: [],
    })
  }
  /** Retire query ownership and any startup polling. */
  dispose(): void {
    this.reset()
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
  }
}
