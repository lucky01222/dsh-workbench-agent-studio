/** Shared connector controls and complete service/action directory, styled by the workbench. */
import { useEffect, useId, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, IconRefreshOutline16 } from './primitives.tsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { AgentDefinition } from '@deepseek-ai/dsh-agent-presets/types'
import type { ConnectorAction, ConnectorQuery } from '@deepseek-ai/dsh-api-agent-studio-controller/types'
import type { ConnectorController, ConnectorSnapshot } from './connector-controller.ts'
import type {} from './locales.ts'
import css from './Workbench.module.css'

/** Framework binds the snapshot; components receive only business callbacks. */
export interface ConnectorInjected {
  hooks: { connector: ConnectorController }
  connectorLoad(refresh?: boolean): Promise<void>
  connectorSearch(query: ConnectorQuery): Promise<void>
  connectorRestart(): Promise<void>
  connectorConsole(): void
}
type ConnectorProps = PropsLocale<'agent-studio'> & InjectFace<ConnectorInjected>
/** Settings → Plugins → Connections, reusing the same lifecycle actions as the picker. */
export function ConnectorSettings(props: ConnectorProps & PropsRuntime<'settings.plugins.tab'>) {
  const state = props.useConnector(s => s),
    { t } = props
  useEffect(() => {
    void props.connectorLoad()
  }, [props.connectorLoad])
  return (
    <section className={css.connectorSettings}>
      <div className={css.connectorHeading}>
        <h3>OpenConnector</h3>
        <span className={css.hint}>v{state.status?.version ?? '1.6.5'}</span>
      </div>
      <p className={css.hint}>{t('connectorIntro')}</p>
      <ConnectorStatusLine state={state} t={t} />
      <div className={css.connectorActions}>
        <Button variant="primary" disabled={state.status?.state !== 'ready'} onClick={props.connectorConsole}>
          {t('connectorManage')}
        </Button>
        <Button
          variant="outline"
          disabled={state.busy}
          onClick={() => {
            void props.connectorLoad(true)
          }}
        >
          {t('refresh')}
        </Button>
        <Button
          disabled={state.busy}
          onClick={() => {
            void props.connectorRestart()
          }}
        >
          {t('connectorRestart')}
        </Button>
      </div>
      <p className={css.hint}>{t('connectorCredentialsHint')}</p>
      <h4>{t('connectorAccounts')}</h4>
      {state.status?.connections.filter(c => c.authType !== 'no_auth').length ? (
        state.status.connections
          .filter(c => c.authType !== 'no_auth')
          .map(c => (
            <div key={c.id} className={css.connectorAccountRow}>
              <strong>{c.service}</strong>
              <span>{c.label}</span>
              <span className={css.hint}>{c.alias}</span>
            </div>
          ))
      ) : (
        <p className={css.hint}>{t('connectorNoAccounts')}</p>
      )}
    </section>
  )
}
function ConnectorStatusLine({ state, t }: { state: ConnectorSnapshot; t: ConnectorProps['t'] }) {
  const status = state.status
  return (
    <div aria-live="polite">
      <p className={css.hint}>
        {t(
          status?.state === 'ready'
            ? 'connectorReady'
            : status?.state === 'starting'
              ? 'connectorStarting'
              : status?.state === 'not-installed'
                ? 'connectorNotInstalled'
                : 'connectorOffline',
          { providers: status?.providers ?? 0, actions: status?.actions ?? 0 },
        )}
      </p>
      {(state.error || status?.error) && (
        <details className={css.dialogError}>
          <summary>{t('errorDetails')}</summary>
          <pre>{state.error === 'connectorPopupBlocked' ? t('connectorPopupBlocked') : (state.error ?? status?.error)}</pre>
        </details>
      )}
    </div>
  )
}
const stateKey = (action: ConnectorAction) =>
  action.state === 'catalog-only'
    ? 'connectorCatalogOnly'
    : action.state === 'needs-connection'
      ? 'connectorNeedsAccount'
      : action.state === 'unsupported'
        ? 'connectorUnsupported'
        : action.state === 'offline'
          ? 'connectorOfflineAction'
          : action.noAuth
            ? 'connectorPublic'
            : 'connectorAuthorized'
/** Paginated full directory; only explicit checkboxes change the current Agent. */
export function ConnectorPicker(
  props: ConnectorProps & {
    draft: AgentDefinition | null
    readOnly: boolean
    toggle(id: string, selected: boolean): void
    bind(service: string, connection: string): void
  },
) {
  const { t } = props,
    state = props.useConnector(s => s),
    id = useId()
  const [providerSearch, setProviderSearch] = useState(''),
    [category, setCategory] = useState('')
  useEffect(() => {
    void props.connectorLoad()
  }, [props.connectorLoad])
  const providers = state.providers.filter(
    p =>
      (!category || p.categories.includes(category)) && `${p.name} ${p.id}`.toLowerCase().includes(providerSearch.toLowerCase()),
  )
  const categories = [...new Set(state.providers.flatMap(p => p.categories))].sort()
  const grouped = [...new Set(state.page.items.map(a => a.service))]
  const selectedCount = props.draft?.tools.filter(id => id.startsWith('openconnector/')).length ?? 0
  return (
    <div className={css.dialogBody}>
      <div className={css.connectorActions}>
        <ConnectorStatusLine state={state} t={t} />
        <Button size="sm" disabled={state.status?.state !== 'ready'} onClick={props.connectorConsole}>
          {t('connectorManage')}
        </Button>
        <Button
          size="sm"
          icon={<IconRefreshOutline16 />}
          disabled={state.busy}
          onClick={() => {
            void props.connectorLoad(true)
          }}
        >
          {t('refresh')}
        </Button>
      </div>
      <div className={css.catalogLayout}>
        <aside className={css.catalogSidebar}>
          <Input
            aria-label={t('connectorSearchServices')}
            placeholder={t('connectorSearchServices')}
            value={providerSearch}
            onChange={(event) => {
              setProviderSearch(event.currentTarget.value)
            }}
          />
          <select
            className={css.select}
            aria-label={t('connectorCategories')}
            value={category}
            onChange={(event) => {
              setCategory(event.currentTarget.value)
            }}
          >
            <option value="">{t('connectorCategories')}</option>
            {categories.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <nav className={css.categoryNav} aria-label={t('connectorServices')}>
            <button
              aria-pressed={!state.query.service}
              onClick={() => {
                void props.connectorSearch({ search: state.query.search ?? '' })
              }}
            >
              <span>{t('connectorAllServices')}</span>
              <span className={css.count}>{state.providers.length}</span>
            </button>
            {providers.map(provider => (
              <button
                key={provider.id}
                title={provider.name}
                aria-pressed={state.query.service === provider.id}
                onClick={() => {
                  void props.connectorSearch({ service: provider.id, search: state.query.search ?? '' })
                }}
              >
                <span className={css.connectorProviderName}>{provider.name}</span>
                <span className={css.count}>{provider.count}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className={clsx(css.catalogResults, css.connectorResults)} aria-busy={state.loading}>
          <Input
            aria-label={t('search')}
            placeholder={t('search')}
            value={state.query.search ?? ''}
            onChange={(event) => {
              void props.connectorSearch({ ...state.query, search: event.currentTarget.value, offset: 0 })
            }}
          />
          <p className={css.hint} role="status">
            {t('connectorSelectionCount', { total: state.page.total, selected: selectedCount })}
          </p>
          {state.loading ? (
            <p className={css.hint}>{t('loading')}</p>
          ) : (
            grouped.map((service) => {
              const accounts = state.status?.connections.filter(c => c.service === service && c.authType !== 'no_auth') ?? []
              const bound = props.draft?.connectorBindings?.[service] ?? ''
              const needsAccount = state.page.items.some(a => a.service === service && !a.noAuth && a.state !== 'catalog-only')
              return (
                <section key={service} aria-label={service}>
                  <div className={css.connectorServiceHeader}>
                    <strong>{state.providers.find(p => p.id === service)?.name ?? service}</strong>
                    {needsAccount && (
                      <label htmlFor={`${id}-${service}`}>
                        {t('connectorAccount')}
                        <select
                          id={`${id}-${service}`}
                          className={css.select}
                          disabled={props.readOnly}
                          value={bound}
                          onChange={(event) => {
                            props.bind(service, event.currentTarget.value)
                          }}
                        >
                          <option value="">{t('connectorChooseAccount')}</option>
                          {bound && !accounts.some(c => c.id === bound) && (
                            <option value={bound}>{t('connectorMissingAccount')}</option>
                          )}
                          {accounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.label} · {account.alias}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className={clsx(css.optionList, css.groupedOptions)}>
                    {state.page.items
                      .filter(a => a.service === service)
                      .map((action) => {
                        const selected = props.draft?.tools.includes(action.toolId) ?? false
                        return (
                          <label key={action.id} className={clsx(css.option, selected && css.optionSelected)}>
                            <span>
                              <strong>{action.id}</strong>
                              <small title={action.description}>{action.description}</small>
                              <small>
                                {t(stateKey(action))} ·{' '}
                                {t(
                                  action.operation === 'read'
                                    ? 'connectorRead'
                                    : action.operation === 'write'
                                      ? 'connectorWrite'
                                      : 'connectorDestructive',
                                )}
                              </small>
                              {action.reason && <small title={action.reason}>{action.reason}</small>}
                            </span>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={
                                props.readOnly ||
                                state.selecting.includes(action.toolId) ||
                                (!selected && ['catalog-only', 'unsupported', 'offline'].includes(action.state))
                              }
                              onChange={(event) => {
                                props.toggle(action.toolId, event.currentTarget.checked)
                              }}
                            />
                          </label>
                        )
                      })}
                  </div>
                </section>
              )
            })
          )}
          {!state.loading && !state.page.items.length && <p className={css.hint}>{t('noMatches')}</p>}
          <div className={css.connectorPagination}>
            <Button
              size="sm"
              disabled={state.loading || state.page.offset === 0}
              onClick={() => {
                void props.connectorSearch({ ...state.query, offset: Math.max(0, state.page.offset - 50) })
              }}
            >
              {t('connectorPrevious')}
            </Button>
            <span className={css.hint}>
              {Math.min(state.page.offset + 1, state.page.total)}–{Math.min(state.page.offset + 50, state.page.total)} /{' '}
              {state.page.total}
            </span>
            <Button
              size="sm"
              disabled={state.loading || state.page.offset + 50 >= state.page.total}
              onClick={() => {
                void props.connectorSearch({ ...state.query, offset: state.page.offset + 50 })
              }}
            >
              {t('connectorNext')}
            </Button>
          </div>
        </div>
      </div>
      <p className={css.hint}>{t('connectorPickerHint')}</p>
    </div>
  )
}
