# 工作室界面

保留编辑器、标签页、消息卡片、草稿和试运行界面。Host 入口只依赖 agentStudio，提供原 /api/workbench-agent-studio 认证路由；Browser 入口通过官方 Client Loader 加载。持久数据由 service 管理，模型运行策略由 runtime 提供。
