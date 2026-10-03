# Agent 工作室

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

比护工作台的使用者，通过工作室配置、试验并复用具有明确职责的 Agent。

## Product Purpose

组合模型、角色提示词、工具插件和 Skills，让用户能清楚控制 Agent 的能力范围。

## Operating Context

运行于官方 DeepSeek Harness 0.1.7-rc.2 的独立工作台插件。2026-10-02 已从用户批准的交互原型实现生产前端候选：组件统一 1.10.0，已接入后端持久绑定和运行快照。Agent 列表、配置和试运行沿用原有布局、小哀主题及共享控件；后端实现维持已批准的交互与布局。

## Capabilities and Constraints

- 官方与自定义插件统一选择；提供官方基础能力组合的全选、部分、未选三态及具体工具明细。
- 支持全部工具与自定义工具子集；扩大已有子集前显示新增工具数量并明确确认。取消丢弃选择弹层事务，完成更新待保存配置。
- 旧逐工具配置按原范围恢复为自定义；未映射工具逐项保留，不猜测所属插件。
- 选择通过 `definition.pluginBindings` 随 Agent 保存在宿主。旧浏览器意图仅在身份、版本及工具集合匹配且用户显式保存时迁移；后端记录优先。
- 宿主根据真实注册来源提供目录。全部模式在新任务开始时纳入新工具；已启动会话、续接与历史重试沿用持久快照，自定义模式保持精确选择。
- 插件可用性来自真实目录；未安装、停用和缺少项目上下文显示原因。缺上下文的创作画布能力禁止新选择，既有不可用范围仍保留供处理。
- Skills 保持独立选择；预设、项目绑定、权限与审批条件继续由已有系统负责。
- 各插件尚未工具化的功能不属于本轮范围。
- Superdesign 原型仅使用已确认免费读取和手工 HTML 导入；生产前端使用仓库原生组件，不调用付费生成。

## Evidence on Hand

实际实现为 `PluginPicker.tsx/.module.css`、`PluginCapabilitySummary.tsx/.module.css`、`Workbench.tsx`、`controller.mjs`、`plugin-capabilities.mjs` 与 `plugin-choice-store.mjs`。控件来自本地 Button / Pill 和官方同版 Input / Modal；20 个已核验插件归属映射以真实工具注册目录为基础，不依赖原型固定工具数量。

阶段验证记录：core 37 / client 16 / host 9 项测试通过；真实宿主界面验证保存与重新加载、取消、全部 / 自定义、范围扩大确认、键盘、亮暗主题和窄屏列表 / 明细。截图位于 `.impeccable/review/frontend/`。隔离预览为 localhost:3511，使用新 Profile 和空知识库目录；原 localhost:3284 未改动。上述验证不构成真实模型运行或新增插件工具能力通过的证明。

## Product Principles

- 从插件理解能力，具体工具按需展开。
- 选择、实际可用状态和本次配置工具范围都可检查。
- 保留旧配置的选择意图，能力扩大由用户主动确认。
- 延续共享控件和语义 tokens，不进行品牌重设计。
- 已保存绑定可跨客户端恢复；目录刷新可以更新草稿，不自动保存或运行。
