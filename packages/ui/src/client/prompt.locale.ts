/** Typed authoring copy shared by the editor and candidate panel. */
export const PROMPT_NS = 'agentStudioPrompt'
/** Chinese prompt-authoring controls. */
export const promptZh = {
  open: 'AI 编写', close: '收起', title: '编写提示词',
  hint: '描述职责、工作方式或需要修改的地方，生成后由你决定是否应用。',
  instruction: '编写要求', placeholder: '例如：创建一个赛事采集助手，优先官方来源，去重并保留原文链接。',
  refinePlaceholder: '描述下一步修改，例如：精简输出格式，补充搜索失败时的处理方式。',
  model: '编写模型', follow: '跟随 Agent 模型', choose: '选择编写模型',
  capabilityHint: '参考当前已选的 {tools} 个工具和 {skills} 个 Skills。',
  generate: '生成候选稿', refine: '继续修改', generating: '正在编写…', stop: '停止', stopped: '已停止，原稿未改变。',
  candidate: '候选稿', compare: '查看差异', original: '当前原稿',
  apply: '应用提示词', discard: '放弃候选稿', restore: '恢复应用前原文', applied: '已应用到 Agent 提示词',
  pending: '等待模型输出，原稿保持不变。', emptyOriginal: '原稿为空',
  failed: '编写失败，请检查模型或修改要求后重试。', details: '错误详情',
  modelRequired: '请选择编写模型，或先为 Agent 配置模型。',
  conflict: '原稿在生成后发生了变化。请查看差异，再决定是否替换。',
  reviewed: '已查看当前原稿，确认使用候选稿替换',
  capabilitiesChanged: '工具或 Skills 已变化，请按当前配置重新生成。',
  copy: '复制差异', copied: '已复制', collapse: '收起差异', expand: '展开剩余 {count} 行', files: '{count} 处修改',
}
/** Dictionary key union. */
export type PromptKey = keyof typeof promptZh
/** English prompt-authoring controls. */
export const promptEn: Record<PromptKey, string> = {
  open: 'AI write', close: 'Collapse', title: 'Write a prompt',
  hint: 'Describe the role, workflow, or changes. Review the candidate before applying it.',
  instruction: 'Writing instructions', placeholder: 'For example: Collect tournament news, prefer official sources, remove duplicates and retain source links.',
  refinePlaceholder: 'Describe the next change, such as a shorter output format or handling failed searches.',
  model: 'Writing model', follow: 'Use Agent model', choose: 'Choose a writing model',
  capabilityHint: 'Uses the {tools} tools and {skills} skills currently selected.',
  generate: 'Generate candidate', refine: 'Refine candidate', generating: 'Writing…', stop: 'Stop', stopped: 'Stopped. Original unchanged.',
  candidate: 'Candidate', compare: 'View changes', original: 'Current original',
  apply: 'Apply prompt', discard: 'Discard candidate', restore: 'Restore previous prompt', applied: 'Applied to Agent prompt',
  pending: 'Waiting for model output. Original unchanged.', emptyOriginal: 'Original is empty',
  failed: 'Writing failed. Check the model or instructions and retry.', details: 'Error details',
  modelRequired: 'Choose a writing model or configure the Agent model first.',
  conflict: 'The original changed after generation. Review the changes before replacing it.',
  reviewed: 'I reviewed the current original and want to replace it',
  capabilitiesChanged: 'Tools or skills changed. Generate again using the current configuration.',
  copy: 'Copy changes', copied: 'Copied', collapse: 'Collapse changes', expand: 'Show {count} more lines', files: '{count} changes',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { /** Authoring independent of trial controls. */ agentStudioPrompt: PromptKey }
}
