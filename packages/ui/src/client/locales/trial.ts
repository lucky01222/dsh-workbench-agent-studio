/** Localized controls for native Agent Studio trial execution. */
export const TRIAL_NS = 'agentStudioTrial'

/** Simplified Chinese trial dictionary. */
export const trialZh = {
  messageNavigation: '消息导航', jumpMessage: '跳转到消息 {number}',
  duration: '{seconds} 秒',
  copyCode: '复制代码', copied: '已复制', footnotes: '注释',
  executeAgain: '再次执行', executeAll: '执行全部工具', resultIsError: '标记为错误', resultPlaceholder: '执行工具，或在此填写任意文字；继续时会使用当前内容。',
  assistantRole: '助手', toggleRole: '切换消息角色', collapseMessage: '折叠消息', expandMessage: '展开消息', insertMessage: '在此插入消息', previewMessage: '预览消息', runFromMessage: '从此消息运行', reorderHint: '拖动排序，或用上下方向键移动', thinking: '思考过程', nativeTrace: '完整执行记录与权限审批', assistantPlaceholder: '输入助手消息…', close: '关闭', undo: '撤销编辑', redo: '重做编辑', more: '更多操作',
  messageEditor: '消息', runResult: '运行结果', userRole: '用户', addMessage: '添加消息', copyMessage: '复制', removeMessage: '删除', moveUp: '上移', editInput: '编辑输入', viewResult: '查看结果', numberedInput: '测试消息 {number}', messageBatchHint: '用户消息按顺序以空行连接，作为一次测试输入发送。',
  title: '试运行', history: '历史', clear: '新建试运行', settings: '试运行设置',
  reactLoop: '启用 ReAct 循环', reactLoopHint: '工具完成后，继续下一步模型推理。',
  autoTools: '自动执行工具', autoToolsHint: '仍遵循 DSH 的工具权限审批。关闭后逐个确认执行或填写结果。',
  autoToolsRequired: '自动继续模型开启时，工具也会自动执行；仍遵循 DSH 的权限审批。',
  input: '测试消息', inputPlaceholder: '输入一条消息，测试这个 Agent…',
  run: '试运行', runAgain: '再次运行', stop: '停止', continue: '继续模型',
  idle: '尚未运行', emptyTitle: '测试你的 Agent', emptyHint: '保存配置后输入测试消息，结果会显示在这里。',
  preparing: '正在准备', running: '运行中', 'waiting-tools': '等待工具结果', 'waiting-model': '等待继续模型',
  succeeded: '已完成', failed: '运行失败', cancelled: '已停止', interrupted: '运行已中断',
  error: '错误详情', pendingTool: '待执行工具', execute: '执行工具', respond: '填写工具结果',
  arguments: '调用参数', toolResult: '工具结果', submitResult: '提交结果',
  invalidJson: '请输入有效的 JSON。', recordedRevision: '配置版本 {revision}',
  saveFirst: '保存当前配置后即可试运行。', shortcut: '⌘ / Ctrl + Enter 运行',
  historyHint: '显示该次试运行结束时的记录。',
  conversationLoading: '正在加载试运行消息', conversationLoadingHint: '正在打开本次试运行的会话。运行状态和操作仍然可用。', retryConversation: '重新加载消息',
}

/** Locale-owned trial key set. */
export type TrialKey = keyof typeof trialZh

/** English trial dictionary. */
export const trialEn: Record<TrialKey, string> = {
  messageNavigation: 'Message navigation', jumpMessage: 'Jump to message {number}',
  duration: '{seconds}s',
  copyCode: 'Copy code', copied: 'Copied', footnotes: 'Footnotes',
  executeAgain: 'Execute again', executeAll: 'Execute all tools', resultIsError: 'Mark as error', resultPlaceholder: 'Execute the tool or write any text here. Continue uses this content.',
  assistantRole: 'Assistant', toggleRole: 'Toggle message role', collapseMessage: 'Collapse message', expandMessage: 'Expand message', insertMessage: 'Insert message here', previewMessage: 'Preview message', runFromMessage: 'Run from this message', reorderHint: 'Drag to reorder, or use the up and down arrow keys', thinking: 'Thinking', nativeTrace: 'Full execution trace and permission approvals', assistantPlaceholder: 'Enter assistant message…', close: 'Close', undo: 'Undo edit', redo: 'Redo edit', more: 'More actions',
  messageEditor: 'Messages', runResult: 'Run result', userRole: 'User', addMessage: 'Add message', copyMessage: 'Duplicate', removeMessage: 'Delete', moveUp: 'Move up', editInput: 'Edit input', viewResult: 'View result', numberedInput: 'Test message {number}', messageBatchHint: 'User messages are joined in order with blank lines and sent as one test input.',
  title: 'Trial run', history: 'History', clear: 'New trial', settings: 'Run settings',
  reactLoop: 'Enable ReAct loop', reactLoopHint: 'Continue model reasoning after tools finish.',
  autoTools: 'Execute tools automatically', autoToolsHint: 'DSH permission approvals still apply. Turn off to execute each tool or provide its result.',
  autoToolsRequired: 'Automatic model continuation includes automatic tool execution. DSH permission approvals still apply.',
  input: 'Test message', inputPlaceholder: 'Enter a message to test this Agent…',
  run: 'Run', runAgain: 'Run again', stop: 'Stop', continue: 'Continue model',
  idle: 'Not run yet', emptyTitle: 'Test your Agent', emptyHint: 'Save the configuration and enter a test message. Results appear here.',
  preparing: 'Preparing', running: 'Running', 'waiting-tools': 'Waiting for tools', 'waiting-model': 'Waiting to continue',
  succeeded: 'Completed', failed: 'Failed', cancelled: 'Stopped', interrupted: 'Interrupted',
  error: 'Error details', pendingTool: 'Pending tool', execute: 'Execute tool', respond: 'Provide tool result',
  arguments: 'Arguments', toolResult: 'Tool result', submitResult: 'Submit result',
  invalidJson: 'Enter valid JSON.', recordedRevision: 'Revision {revision}',
  saveFirst: 'Save the current configuration to run a trial.', shortcut: '⌘ / Ctrl + Enter to run',
  historyHint: 'Showing the record as it stood when this trial ended.',
  conversationLoading: 'Loading trial messages', conversationLoadingHint: 'Opening this trial’s session. Run status and controls remain available.', retryConversation: 'Reload messages',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Native Agent trial controls and statuses. */
    agentStudioTrial: TrialKey
  }
}
