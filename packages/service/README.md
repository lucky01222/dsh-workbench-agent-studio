# 工作室服务

负责 workbench_agent_studio 数据域、Agent 版本、试运行、历史和评价。通过 ctx.agentStudio 提供 apiVersion=1 的公共服务；UI 和其它 Host 插件声明 inject: [agentStudio] 后调用，例如 await ctx.agentStudio.create({name: "助手"})。同一 Profile 只启用一个服务实例。

公共方法名单由 /protocol 的 STUDIO_METHODS 导出，参数验证由业务服务执行。HTTP适配不在本包内。初始化完成后才公布服务；停用先撤销消费者，再排空任务和关闭存储，不删除用户数据。
