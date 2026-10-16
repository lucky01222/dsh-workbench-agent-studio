# DSH Agent 工作室

在 DeepSeek Harness Web 中可视化配置和试跑 Agent：按插件绑定工具、编辑工具结果后继续运行、保存会话能力快照，并导出可独立运行的 Preset。内置“Agent 创建助手”可通过对话逐步生成新 Agent。

[English](README.md) · [安装包下载](https://github.com/lucky01222/dsh-workbench-agent-studio/releases/latest) · [更新记录](CHANGELOG.md)

![Agent 配置：模型、插件能力与系统提示词](media/configuration.png)

## 安装

需要 **Node.js 24+**，以及官方 **DSH Web 0.1.7-rc.2 或 0.2.0-rc.2**。停止目标 Web Profile 后执行：

```sh
dsh plugin --profile web add https://github.com/lucky01222/dsh-workbench-agent-studio/releases/download/v1.13.3/dsh-workbench-agent-studio-1.13.3.tgz
dsh web
```

上面的命令直接安装 GitHub Release 产物。本版出现在 npm 后，也可按包名 `dsh-workbench-agent-studio@1.13.3` 安装。

安装和启动使用相同的 `DSH_HOME`。完整包内含 Service、UI 和 Runtime；不依赖导航、主题、资料库或文档插件。

也可从 [GitHub Releases](https://github.com/lucky01222/dsh-workbench-agent-studio/releases/latest) 下载预构建 `.tgz`，将文件路径传给 `dsh plugin --profile web add`。GitHub 源码不含 `dist/`，不能把源码下载当作现成安装包。

本版为 **工作室 1.13.3 / runtime 1.10.5**，只声明上述两个精确宿主版本。**不支持 0.2.1-alpha.5**：该版移除了工具 `both` 模式，PTC 行为也有变化。已补充验证官方 macOS Apple Silicon 桌面版 0.2.0-rc.2，其他桌面版本仍未验证。桌面安装须使用自带 CLI 和 `--profile desktop`，详见[兼容验证记录](docs/compatibility.md)。

## 一条完整的工作流程

1. 从侧栏打开“Agent 工作室”，新建 Agent，或复制内置预设。
2. 选择对话模型、系统提示词、插件工具与 Skills。每个插件可选择全部工具或精确子集。
3. 输入消息试运行；手动或自动执行工具，编辑工具结果后继续模型，也可从指定消息重跑。旧运行保留在历史中。
4. 使用保存的 Agent 开始正式对话，或导出 Preset，在另一套宿主中运行。

![按插件挑选工具，并限定只读范围](media/plugin-bindings.png)

工具归属来自宿主的实际注册信息。会话开始时保存有效工具范围和插件身份；续接和历史重试保持原快照。插件移除或工具归属变化会明确报告不可用，不会静默授予同名的新工具。

![修改工具结果后继续试运行](media/trial.png)

截图来自隔离的 DSH 0.2.0-rc.2，使用合成数据与本地脚本模型，仅展示界面和操作，不代表真实外部模型的回答质量。

## 通过对话创建 Agent

在新会话开始前选择“Agent 创建助手”。它依次确认需求、选择可用能力、编写提示词、检查和试跑，用户确认后保存。创建工具只属于该预设，标准模式和其他 Agent 不带这些工具。创建助手的试跑只真实执行只读工具，其余调用记录为未执行；未保存草稿不会出现在工作室列表中。

## 它会修改什么

工作室会**停用官方 `tools` 配置行**，换成记录工具注册归属的 `ToolRuntime` 子类。执行、schema 校验、权限和作用域检查沿用官方父类，原 `tools` 行的配置会被继承。同时挂载能力快照服务，并把已保存 Agent 注册成预设。

**其他替换工具提供者或改写同一工具层的插件可能冲突。** 同时使用前核对组合配置。安装、卸载或修改工具提供者配置后重启 Profile。卸载工作室 Bundle 后官方提供者恢复，除非你另有覆盖它的配置。

## 数据与卸载

数据使用宿主官方存储后端，默认位于 **`$DSH_HOME/storages`**：

| 数据域 | 内容 |
|---|---|
| `workbench_agent_studio` | Agent、修订、试运行、评价、工具回执与提示词草稿 |
| `workbench_agent_studio_capabilities` | 会话能力快照 |
| `workbench_agent_studio_library_migrations` | 显式兼容迁移的回执；无需安装资料库 |

默认工作目录为 `$DSH_HOME/workbench-agent-studio/workspace`。模型、凭据和工具由宿主提供；试运行内容会发送到你选择的模型，工具按宿主授予的权限执行。

```sh
dsh plugin --profile web remove dsh-workbench-agent-studio
```

卸载后重启 Profile。工作室入口与 API 消失，保存的数据保留，重装后可继续读取；用户文件和会话不会被删除。

## 在另一套环境运行导出的 Preset

接收端安装独立 Runtime、实际用到的工具插件，并配置对应模型：

```sh
dsh plugin --profile web add https://github.com/lucky01222/dsh-workbench-agent-studio/releases/download/v1.13.3/dsh-workbench-agent-studio-runtime-1.10.5.tgz
dsh web --patch /path/to/exported-agent.yml
```

导出文件带有宿主级工具注册器、快照服务和 Preset 配置，不需要工作室 Service/UI。不要在每个 Agent 内重复挂载快照服务；移除 Runtime 前先移除依赖它的 Preset 配置。

## 开发与验证

构建命令与测试边界见 [English README](README.md#development-and-verification)。已在两个声明的官方宿主上运行集成测试，并在全新 0.2.0-rc.2 环境验证工具绑定、真实文件读取、结果编辑、历史、独立导入和卸载重装。脚本模型测试不等于真实外部模型效果验证。

代码采用 [MIT 许可](LICENSE)；第三方代码来源与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
