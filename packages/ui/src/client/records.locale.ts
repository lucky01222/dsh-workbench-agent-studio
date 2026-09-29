/** Locale-owned Studio history navigation and read-only record labels. */
export const RECORDS_NS = 'agent-studio-records'
export const zh = {
  snapshotTitle: '运行时的 Agent 配置', model: '模型', tools: '工具', skills: 'Skills', promptLabel: '系统提示词', none: '未设置',
  title: '工作室历史', back: '返回配置', list: '返回记录', allAgents: '全部 Agent（含已删除）', agent: 'Agent',
  kind: '记录类型', allKinds: '全部类型', trial: '试运行', prompt: '提示词编写', status: '状态', allStatuses: '全部状态',
  preparing: '准备中', running: '运行中', succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断',
  'waiting-tools': '等待工具', 'waiting-model': '等待继续', refresh: '刷新', more: '加载更多', open: '查看记录',
  loading: '正在加载记录…', empty: '没有符合条件的记录', hint: '试运行和提示词编写记录只在工作室保留，不会混入日常对话。',
  error: '记录未能加载', errorDetails: '错误详情', revision: '版本 {revision}', instruction: '编写要求', original: '当时的原稿',
  candidate: '生成的候选稿', noCandidate: '没有完整候选稿', readOnly: '这是历史快照，查看不会重新运行或修改当前提示词。', trace: '完整执行记录与权限审批',
} as const
type Key = keyof typeof zh
export const en: Record<Key, string> = {
  snapshotTitle: 'Captured Agent configuration', model: 'Model', tools: 'Tools', skills: 'Skills', promptLabel: 'System prompt', none: 'Not set',
  title: 'Studio history', back: 'Back to configuration', list: 'Back to records', allAgents: 'All Agents (including deleted)', agent: 'Agent',
  kind: 'Record type', allKinds: 'All types', trial: 'Trial', prompt: 'Prompt writing', status: 'Status', allStatuses: 'All statuses',
  preparing: 'Preparing', running: 'Running', succeeded: 'Completed', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted',
  'waiting-tools': 'Waiting for tools', 'waiting-model': 'Waiting to continue', refresh: 'Refresh', more: 'Load more', open: 'View record',
  loading: 'Loading records…', empty: 'No matching records', hint: 'Trials and prompt-writing records stay in Studio, separate from daily conversations.',
  error: 'Could not load the record', errorDetails: 'Error details', revision: 'Revision {revision}', instruction: 'Writing request', original: 'Original prompt',
  candidate: 'Generated candidate', noCandidate: 'No complete candidate', readOnly: 'This is a historical snapshot. Viewing it does not rerun or change the current prompt.', trace: 'Execution record and approvals',
}
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'agent-studio-records': Key } }
