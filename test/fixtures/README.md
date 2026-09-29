# 可移植性验收探针

runtime-probe.mjs 供隔离的官方 headless Profile 使用，必须复制到该 Profile 的模块解析范围。挂载 agent-preset-registry 和实际导出的 Preset 后，以配置 id、definition、cwd、kind 启用此探针，关闭原 headless-startup/headless-runner 以避免双驱动。

探针注册 studio-test 本地模型和 studio_test_echo，无模型网络请求；创建新 Session 并验证真实传入模型的提示词、可见工具、两次主请求、一次真实工具调用及最终完成事件。官方会话标题请求单独计数。它断言 ctx.agentStudio 不存在，验证角色无需工作室服务。

两种组合：portable 只安装独立 runtime 包并使用新导出；legacy 安装兼容组合包但禁用 service/ui，用旧 /policy 导出。请在新建测试 DSH_HOME 中执行，不把测试探针启用在日常 Profile。
