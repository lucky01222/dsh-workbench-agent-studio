# Agent 运行策略

适配官方 Harness 0.1.7-rc.2 的独立运行支持，无需工作室 Service 或 UI。

- `/tool-registry`：继承官方 ToolRuntime，补充真实插件注册来源；在 Host 上替代原工具提供者并继承其配置。
- `/snapshots`：Host 级单例，使用官方 storageDomain 持久保存每个会话的能力与角色快照。
- 默认入口：挂载在 Preset 中的模型、提示词、工具及 Skill 范围策略，插件绑定模式依赖上述 Host 支持；旧 tools[] 预设在没有该服务时仍沿用精确范围策略。
- `/schema` 与 `/capabilities`：配置合同、能力解析和目录归属。

优先使用工作室导出的组合 YAML。旧 `tools[]` 配置保持精确选择；`pluginBindings` 只有明确的 all 模式才在新会话扩大到当前插件工具。已开始会话、续接与历史重试不自动扩张。插件移除或已选工具归属变化会报告不可用。

新导出包含禁用官方 tools 行、挂载来源注册器与快照服务的 Host 配置；不要把快照服务重复放进每个 Preset。配置中的模型与实际工具插件仍由接收宿主提供。
