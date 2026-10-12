# DSH Agent Studio

适用于官方 DeepSeek Harness Web **0.1.7-rc.2** 的 Agent 工作室。支持 Agent 配置、多标签草稿、内置预设复制、模型、插件能力与 Skill 选择、提示词编辑、试运行、工具结果编辑及运行历史。

## 1.12 Agent 创建助手

在主界面对话里边问边建 Agent，保存为工作室“我的 Agent”。

- **入口**：主界面开新对话前切到内置的“Agent 创建助手”（`agent-creator`，工作室注册的只读预设，可复制为自己的 Agent）。创建工具只挂在这个预设上，标准模式和其他 Agent 不带这些工具。
- **工具**（只在创建助手内可用）：`agent_studio_catalog` 读取真实可用的对话模型、插件工具和 Skills；`agent_studio_write_prompt` 复用“AI 编写”为未保存的草稿写提示词；`agent_studio_check` 静态检查；`agent_studio_confirm` 显示需求、能力、提示词确认卡片；`agent_studio_trial` 试跑；`agent_studio_save` 保存。
- **检查点由工具保证**：确认能力和提示词前要先确认需求；试跑要求当前草稿的能力和提示词已确认；保存还要求已经试跑或用户选择跳过。试跑和保存各自先弹出确认卡片，保存卡片附最近一次试跑结果。草稿改动后对应部分要重新确认，未改动的部分不重复询问。
- **试跑安全**：每次 1～3 条示例任务；只读工具真实执行，其他工具（写文件、改资料库、执行命令、未知工具等）只记录调用、不执行。试跑记录留在工作室“Agent 创建助手”的历史里。
- 官方 Harness 0.1.7-rc.2 的子 Agent 不能指定预设、不能向用户提问，会话开始后也不能换预设，所以没有做“总助手转交给创建助手”。

## 1.11 配置栏精简

- 模型下拉只列对话模型：rc.2 的模型目录没有输出类型或工具调用字段，沿用导航插件的规则排除向量、重排、图片和视频路由；已保存的其他模型仍显示并标注“不在可选列表”。
- 资料库归属更新收成一行：“更新”按已保存的工具范围一步完成，之后只在本次会话显示“撤销”；会新增或移除工具、或无法更新时才列出原因并要求确认。迁移记录、恢复与撤销的服务端协议不变。
- 移除“能力检查”弹窗和与标签重复的说明文字；插件选择里的工具说明默认显示两行，悬停查看全文。
- 插件选择里展开“官方基础能力”时，官方插件列表直接接在这一行下面，不再跳到自定义插件之后。
- Skills 与插件能力同样按来源分组：插件随附的 Skill 归在对应插件下（由 SKILL.md 的安装位置判断），本机的归入“项目 / 我的 Skills”；选择窗口与插件选择同样是左侧分组、右侧明细。只改 Skills 时保留现有插件绑定，仅补上 skill 加载工具（此前会从扁平工具名重建全部绑定，把统一资料库的工具拆成“未识别归属”）。
- 样式模块改名为 `AgentStudio.module.css`，避免与文档工作台同名的 `Workbench_*` 类互相覆盖（模型标签曾因此被挤到下拉框上方）。

## 1.10.2 资料库合并兼容候选

配合统一资料库 `dsh-workbench-library@0.23.1`，旧知识工具的五个读取工具按真实注册归属校验。旧角色的“全部工具”先固定为保存的范围，已有会话和分支继续受原工具上限约束；历史修订、运行和会话快照保留原样。

工作室提供权限迁移预览、显式应用和撤销。默认保留保存的名单，也可明确选择当前双包的有效范围；预览逐项显示工具增减。新定义采用精确工具选择，未启用的旧选择保留在权限回执中，其他插件选择保持。普通提示词保存不顺带迁移归属。

迁移回执在独立数据域中保存操作身份、版本、权限差异和摘要，不复制提示词。中断后按同一操作身份核对恢复；待完成操作阻止其他保存、删除或新迁移覆盖其恢复点。撤销核对后续权限修改，保留后续提示词等其他编辑。只读、已删除、带自定义组件或冻结运行范围的定义不自动改写。

这是隔离环境验收候选，未切换日常 Profile。软件回退前需先核对配置及当前权限投影；曾在统一插件下运行的新历史快照仍保留其真实 owner，旧软件不能据同名工具猜测归属。

## 安装

需要 Node.js 24 和官方 Harness 0.1.7-rc.2。先通过下方命令构建安装包，或使用对应版本的完整应用 tgz。指定目标 `DSH_HOME`，停止该 Profile 的 Web 进程后安装：

```sh
export DSH_HOME=/absolute/path/to/your-dsh-home
dsh plugin --profile web add /absolute/path/dsh-workbench-agent-studio-1.10.2.tgz --ignore-scripts --offline
dsh web --host 127.0.0.1 --port 3184
```

完整应用包内含三个组件，无需逐个安装。模型、凭据以及角色所需的官方工具包由目标 Harness 提供。全局导航插件 `dsh-workbench-shell` 可独立安装；本应用不依赖它，也不安装 OpenConnector。

## 组件

| 包 | 职责 | 作用域 |
|---|---|---|
| `dsh-workbench-agent-studio` | 安装组合与旧 `/policy` 兼容入口 | Profile bundle |
| `dsh-workbench-agent-studio-service` | Agent 文档、版本、试运行、历史和评价 | Host |
| `dsh-workbench-agent-studio-ui` | Web 编辑器和认证 HTTP 适配 | Host / Client |
| `dsh-workbench-agent-studio-runtime` | 注册来源、会话快照及模型/提示词/能力范围策略 | Host / Preset |

服务通过 `ctx.agentStudio` 提供 `apiVersion = 1` 的受信任 Host API。调用方声明 `inject: ['agentStudio']`；方法白名单见 service 包的 `/protocol` 出口。该 API 不自动暴露为模型工具。

试运行采用有限步执行驱动并复用官方工具审批和存储。正式对话使用官方 AgentLoop。

## 导出与数据

新导出的 Preset 引用独立 Runtime；在另一套官方 Harness 中，安装 Runtime、角色实际用到的工具包并配置模型后即可运行，无需工作室 Service 或 UI。

旧导出使用的 `dsh-workbench-agent-studio/policy` 保留兼容转发。卸载应用移除工作室入口和 API，保留用户数据；重装后可重新读取。升级前建议备份目标 `DSH_HOME`。

## 开发与打包

三个组件共用一个 npm workspace。构建使用宿主的 React/Cordis 共享模块；发布包通过 `bundledDependencies` 携带真实组件，不依赖工作区软链接。

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run build
npm run check
npm test
npm run test:client
DSH_RUNTIME_ROOT=/absolute/path/to/official-runtime npm run test:host
npm run pack:release -- ./release
```

`DSH_RUNTIME_ROOT` 指向安装有官方 Harness `node_modules` 的目录。`check` 为 JavaScript 语法检查，不是全量 TypeScript 检查。测试夹具的使用方式见 `test/fixtures/README.md`。

发布目录中的 `dsh-workbench-agent-studio-1.10.0.tgz` 是完整安装包，其余三个 tgz 用于单独分发组件。第三方许可证见 `THIRD_PARTY_NOTICES.md`。

## 1.10.0 插件能力绑定

工作室按插件选择工具，官方能力可以一次组合开启。目录归属来自实际注册工具的插件及 Bundle，不按工具名称前缀推断；动态注册、子入口和多个配置实例都会合入实际所属插件。没有可靠归属的工具保留精确选择。

Agent 的 `definition.pluginBindings` 持久保存插件开关、`all`/`custom` 模式和已选工具。`all` 在新任务启动时纳入插件新增工具；`custom` 保持精确范围。原有仅含 `tools` 的 Agent 不会自动升级为整组模式。前端旧浏览器记录只有显式保存时才迁移到服务端，已保存配置可在其他客户端恢复。

每个会话在启动时保存实际工具、插件版本与角色范围；续接、恢复、历史工具重试使用该快照。同预设 fork 继承父快照，子 Agent 的工具过滤只能缩小范围。插件或已记住的工具移除、工具归属变化时明确报告不可用，需重新选择，不会静默换成同名工具。

Runtime 的 `/tool-registry` 是官方 `ToolRuntime` 的薄子类，执行、审批、作用域和工具 schema 仍沿用官方实现。组合包暂时禁用官方 `tools` 行并挂载这个提供者，继承该行配置；应用停用后官方提供者恢复。修改原 `tools` 配置后重启 Profile 生效。`/snapshots` 是 Profile 级单例，数据保存在官方 storageDomain 的 `workbench_agent_studio_capabilities` 域；不要在每个 Preset 内重复挂载。

导出文件包含上述 Host 支持行与 Preset 绑定。接收端需要安装同版 Runtime 和实际能力插件。旧的仅含 `tools[]` 的独立预设仍可使用精确范围策略；新插件绑定缺少 Host 支持时会明确拒绝启动。没有历史快照且只能读到 PTC `run_code` 请求的旧会话无法可靠恢复历史工具集合，会提示新建会话。

测试覆盖插件动态增加/移除、来源追踪、跨客户端保存、旧配置兼容、会话恢复、fork/子 Agent 限制、历史手动执行及 Host 卸载。真实预览验证使用本地固定响应适配器，不产生外部模型请求。

## 1.8.5 样式修复

修复其他 Client 插件热更新或卸载后，Agent 工作室整块界面丢失样式的问题。工作室 CSS 在 `apply` 阶段注入，晚于官方 Loader 对其 factory 的样式认领；未标记的 CSS 会被后续加载的插件认领，再被那个插件的清理流程删除。现在注入前设置 `data-plugin` 和 `data-plugin-css`，由工作室自身持有和清理。

本次检查保留工作室现有共享控件、主题 tokens、配置/试运行布局与草稿数据。`test:client` 会先重新构建，再执行真实生成的 Client bundle，覆盖其他插件样式认领/替换、工作室停用/重新启用以及旧实例清理。该测试使用内存 DOM 和模拟的 Loader 样式操作；实际官方 Loader 与浏览器验证应另行记录，不能据此声称全量浏览器兼容。
