# DSH Agent Studio

适用于官方 DeepSeek Harness Web **0.1.7-rc.2** 的 Agent 工作室。支持 Agent 配置、多标签草稿、内置预设复制、模型/工具/Skill 选择、提示词编辑、试运行、工具结果编辑及运行历史。

## 安装

需要 Node.js 24 和官方 Harness 0.1.7-rc.2。先通过下方命令构建安装包，或使用对应版本的完整应用 tgz。指定目标 `DSH_HOME`，停止该 Profile 的 Web 进程后安装：

```sh
export DSH_HOME=/absolute/path/to/your-dsh-home
dsh plugin --profile web add /absolute/path/dsh-workbench-agent-studio-1.8.4.tgz --ignore-scripts --offline
dsh web --host 127.0.0.1 --port 3184
```

完整应用包内含三个组件，无需逐个安装。模型、凭据以及角色所需的官方工具包由目标 Harness 提供。全局导航插件 `dsh-workbench-shell` 可独立安装；本应用不依赖它，也不安装 OpenConnector。

## 组件

| 包 | 职责 | 作用域 |
|---|---|---|
| `dsh-workbench-agent-studio` | 安装组合与旧 `/policy` 兼容入口 | Profile bundle |
| `dsh-workbench-agent-studio-service` | Agent 文档、版本、试运行、历史和评价 | Host |
| `dsh-workbench-agent-studio-ui` | Web 编辑器和认证 HTTP 适配 | Host / Client |
| `dsh-workbench-agent-studio-runtime` | 模型、提示词、工具和 Skill 范围策略 | Preset |

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

发布目录中的 `dsh-workbench-agent-studio-1.8.4.tgz` 是完整安装包，其余三个 tgz 用于单独分发组件。第三方许可证见 `THIRD_PARTY_NOTICES.md`。
