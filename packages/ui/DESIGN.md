---
name: Agent 工作室 · 紫灰工作台
description: 已实现生产前端的紧凑插件能力选择界面；复用宿主语义 tokens 与原生控件。
colors:
  brand: "var(--dsw-alias-brand-primary)"
  primary-fill: "var(--dsw-alias-button-primary-fill)"
  primary-hover: "var(--dsw-alias-button-primary-hover)"
  primary-foreground: "var(--dsw-alias-label-primary-foreground)"
  text: "var(--dsw-alias-label-primary)"
  secondary: "var(--dsw-alias-label-secondary)"
  tertiary: "var(--dsw-alias-label-tertiary)"
  base: "var(--dsw-alias-bg-base)"
  layer-one: "var(--dsw-alias-bg-layer-1)"
  layer-two: "var(--dsw-alias-bg-layer-2)"
  panel: "var(--dsw-theme-panel-surface, var(--dsw-alias-bg-layer-2))"
  sidebar: "var(--dsw-specific-sidebar-fill)"
  line: "var(--dsw-alias-border-l3)"
  field-line: "var(--dsw-alias-border-l4)"
  hover: "var(--dsw-alias-interactive-bg-hover)"
  active: "var(--dsw-alias-interactive-bg-active)"
  selected: "var(--dsw-alias-control-selected)"
  selected-border: "var(--dsw-alias-control-selected-border)"
  warning: "var(--dsw-alias-state-warn-label)"
  error: "var(--dsw-alias-state-error-primary)"
  focus: "var(--dsw-alias-control-focus)"
  mask: "var(--dsw-alias-bg-mask-1)"
typography:
  title:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  title-mobile:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "25px"
  detail-title:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
  detail-title-mobile:
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "var(--dsw-font-family)"
    fontSize: "14px"
  row-title:
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
  label:
    fontSize: "12px"
    lineHeight: "20px"
  supporting:
    fontSize: "11px"
    lineHeight: "19px"
  technical:
    fontFamily: "var(--ds-font-family-code)"
    fontSize: "10px"
    lineHeight: "18px"
rounded:
  control: "var(--dsw-control-radius-input)"
  input: "var(--dsw-radius-md)"
  small: "var(--dsw-radius-xs)"
  capsule: "calc(var(--dsw-control-height-md) / 2)"
  compact-capsule: "calc(var(--dsw-control-height-sm) / 2)"
  dialog: "var(--dsw-radius-panel)"
spacing:
  tight: "4px"
  icon: "6px"
  small: "8px"
  row: "10px"
  control: "12px"
  pane: "16px"
  dialog: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.capsule}"
    padding: "0 14px"
    height: "var(--dsw-control-height-md)"
  button-outline:
    textColor: "{colors.text}"
    rounded: "{rounded.capsule}"
    padding: "0 14px"
    height: "var(--dsw-control-height-md)"
  button-compact-rounded:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "var(--dsw-control-height-sm)"
  search-input:
    backgroundColor: "{colors.layer-one}"
    textColor: "{colors.text}"
    rounded: "{rounded.input}"
    padding: "0 8px"
    height: "32px"
  filter-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    padding: "0 11px"
    height: "30px"
  skill-tag:
    backgroundColor: "{colors.layer-two}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "var(--dsw-control-height-pill)"
  plugin-row:
    rounded: "{rounded.control}"
    padding: "10px"
  confirmation:
    backgroundColor: "{colors.layer-one}"
    rounded: "{rounded.control}"
    padding: "12px"
---

# Design System: Agent 工作室

## Overview

**Creative North Star: "紧凑紫灰工作台"**

这是现有 Agent 工作室的局部延伸。浅紫灰层级、紧凑中文信息行和明确的选择状态延续既有工作台；配置、提示词、Skills 与试运行位置保持可辨认。生产界面的共享控件与 `--dsw-*` 语义 tokens 是权威，前置值记录实际变量引用，不复制原型硬编码色表。

记录日期：2026-10-02，前端布局基线 1.9.0，后端对接候选 1.10.0。样式来源为 [PluginPicker](src/client/PluginPicker.module.css)、[配置摘要](src/client/PluginCapabilitySummary.module.css)、[Workbench](src/client/AgentStudio.module.css)、[Button](src/client/Button.module.css) 和 [Pill](src/client/Pill.module.css)；Input / Modal 由官方同版 `@deepseek-ai/dsh-client-ui-primitives` 提供。范围以 [PRODUCT.md](PRODUCT.md) 为准。批准的 [Superdesign 原型 version 2](https://p.superdesign.dev/draft/13358642-bb06-4c8c-afe7-43a60501d7b4) 保留为交互参考，当前生产源码和原生控件决定实现细节。

[亮色桌面](../../.impeccable/review/frontend/desktop.jpg)、[暗色桌面](../../.impeccable/review/frontend/desktop-dark.jpg)、[窄屏列表](../../.impeccable/review/frontend/mobile.jpg)、[窄屏明细](../../.impeccable/review/frontend/mobile-detail.jpg)、[配置页](../../.impeccable/review/frontend/configuration.jpg) 记录真实宿主前端。上述截图记录前端阶段样式。1.10.0 已接入服务端 `pluginBindings` 与实际注册归属；整组解析和会话快照另由后端集成验证，不依据截图认定运行通过。

**Key Characteristics:**

- 紫灰语义色与半像素分隔线组织密集信息。
- 中文系统无衬线字体；技术名称降为小号等宽字。
- 插件作为紧凑选择行，工具明细渐进展开。
- 桌面保留双栏，窄屏在同一弹层内返回列表。

## Colors

色彩跟随宿主亮暗主题及外观设置；此界面不设独立配色。前置 `var(...)` 是规范引用，不能把某张截图的解析值改成局部常量。Sidecar 记录角色与可继承的 CSS，不生成未经当前宿主解析验证的静态色阶。

### Primary

- **品牌与操作色**：`brand` 表达选择、工具勾选和链接；主按钮使用独立填充 / 悬停 / 前景语义变量。
- **焦点色**：`focus` 用于键盘焦点，继承共享焦点宽度及偏移。

### Secondary

- **条件与错误色**：`warning` 用于不可用原因，`error` 用于目录请求失败；错误详情保持折叠，同时保留文字证据。

### Neutral

- `text` / `secondary` / `tertiary` 区分名称、说明和次要信息。
- `base` / `layer-one` / `layer-two` / `panel` / `sidebar` 延续宿主工作面层级。
- `line` / `field-line` 用于列表与输入薄边线。
- `hover` 表达悬停或打开行；`selected` 与 `selected-border` 表达过滤及范围分段状态，插件启用仍由复选框表达。

**The Semantic State Rule.** 悬停、已打开、已勾选和暂不可用各有可见证据，不能只依赖颜色。

## Typography

中文与拉丁正文使用宿主 UI 字体，技术标识使用宿主 code 字体。完整 type ramp 在前置 tokens 中；`title-mobile`（18px / 25px）与 `detail-title-mobile`（16px / 24px）是批准原型延续的有意响应步级，适用于（600px）以下媒体查询。检测器对这两级的提示是审阅建议，不构成更改既有字号的要求。

实际标题选择器为 `PluginPicker.header h2` 与 `detailHeading h3`。插件名称为（13px / 20px / 500），工具名称为（12px / 18px / 500），工具说明为（11px / 18px），折叠技术信息为（11px / 19px）。计数采用 tabular numerals；长名称允许断行，窄屏工具代码移至下一行。既有提示词编辑器保持（13px / 1.7）及其原有等宽规则。

## Layout

`Workbench.root` 位于宿主工作区，保留（224px）Agent 侧栏及可调配置 / 试运行分栏。分隔器为（8px）可操作目标、绘制（1px）线；字段为（80px 标签 / 剩余宽度），间距（12px），配置内边距（12px）。外壳、配置与列表遵循 `min-width:0` / `min-height:0` 与独立滚动。

`PluginPicker.dialog` 复用原生 Modal 的可用区域，宽度 `min(1000px,100%)`、高度 `min(700px,100%)`、最大高度 `100%`；不额外计算视口高度。主内容为（360px 列表 / 剩余明细），标题、工具栏和完成区不参与正文滚动。列表 / 明细分别滚动，底部最小高度（70px）。插件行最小高度（62px），工具行（52px），配置摘要行（44px）；摘要列表最高（184px）后独立滚动。

| 查询与所属表面 | 实际变化 |
| --- | --- |
| Workbench 容器 ≤1150px | 侧栏缩为 190px。 |
| Workbench 容器 ≤950px | 侧栏成为 240px 覆盖层，保留其原生打开 / 关闭方式。 |
| Workbench 容器 ≤760px | 配置 / 试运行由移动标签切换；字段标签 64px、间距 8px。 |
| Picker 媒体 ≤950px | 列表缩为 310px。 |
| Picker 媒体 ≤760px | 列表缩为 270px；内边距收至 16px，隐藏行计数及刷新按钮。 |
| Picker 媒体 ≤600px | 列表 / 明细同层切换；过滤与搜索分行，行计数恢复显示，页脚按钮为 32px 高且允许换行。 |

窄屏通过 `body[data-detail=true]` 切到明细，返回按钮回到对应插件行。未指定或选中插件时，优先检查可见且可用的自定义插件；若检查官方插件则展开官方组，避免明细与隐藏列表行脱节。该处理不改启用状态或范围。原生 Modal 的视口变化生命周期保持既有行为；稳定宽度下的列表 / 明细适配是本阶段截图覆盖范围。

## Elevation & Depth

工作面靠色阶和薄分隔线建立层级，原生 Modal 继承宿主遮罩、panel 圆角和 `--dsw-elevation-prominent`。范围分段使用语义选中边框的半像素内描边，未沿用原型自制浮起阴影。按钮继承共享快速颜色过渡；Modal 继承原生透明度入场与 reduced-motion 处理，不另加装饰动画。

**The Quiet Surface Rule.** 连续列表与工作面保持平面，显著深度留给覆盖弹层。

## Shapes

几何由实际控件所属 tokens 决定：中号 / 紧凑按钮为对应高度的一半，`shape="rounded"`、过滤项及插件行使用 `--dsw-control-radius-input`；官方 Input 实际读 `--dsw-radius-md`，Modal 实际读 `--dsw-radius-panel`。不能用未生效的控件契约覆盖它们。列表边线为（0.5px），原生复选框为（16 × 16px）；按钮禁用透明度（.4），不可用复选框为（.5）。

图标复用现有 IconCordisPlugin / AgentPreset 等原生资源，不复制原型各来源的装饰性图标。工作台品牌与外观仍由现有宿主表面管理。

## Components

| 实际组件 / CSS Module 选择器 | 外观与行为 |
| --- | --- |
| `Button.primary / outline / ghost / rounded` | 使用共享语义变体；取消与完成保留中号胶囊，范围及刷新使用紧凑 rounded。 |
| 官方 `Input` + `PluginPicker.search` | 官方输入边线 / 圆角与焦点处理，选择器只约束宽度、12px 字号及品牌 caret。 |
| `PluginPicker.filter` | 原生按钮，`aria-pressed=true` 用共享 selected 与 brand；过滤条可横向滚动。 |
| `PluginPicker.pluginRow / pluginOpen / checkbox` | 打开明细与启用是两个控件；复选框保持选中证据，打开行用 hover 底色。 |
| `PluginPicker.modes` | 共享紧凑按钮组成范围控制；已有子集扩大前给出明确数量确认。 |
| `PluginPicker.toolRow / technical` | 薄分隔线、技术名与条件说明；技术信息默认折叠。 |
| `PluginCapabilitySummary.rows / row / title` | 官方能力按组摘要，其他插件逐行；每行打开对应工具明细，移除控制独立。 |
| `Pill.tag` | Skills 保持独立的既有标签与选择器。 |
| `PluginPicker.requirement / error` | 条件原因可读；缺上下文的新启用禁用，既有不可用范围可检查处理；请求错误详情折叠。 |
| `PluginPicker.footer / summary` | 计数由实时选择计算；取消回滚弹层事务，完成进入配置草稿，保存仍是下一步。 |

焦点采用共享宽度 / 偏移与语义色。窄屏进入明细聚焦返回按钮，返回聚焦原行；已选过滤中移除最后项时回到适当行或过滤控件。Modal 的 Escape、焦点生命周期与遮罩继续由原生组件负责。源码行为和本阶段实际前端操作校验一致，仍不等同于模型或真实工具执行测试。

## Do's and Don'ts

### Do:

- **Do** 复用生产语义 tokens 与相邻共享控件，保持亮暗主题一致。
- **Do** 用薄分隔线、紧凑信息行和渐进明细组织插件与工具。
- **Do** 同时保留可读状态文本、复选框与明确键盘焦点。
- **Do** 在窄屏验证列表返回、长标识换行、正文滚动和固定完成区。

### Don't:

- **Don't** 让旧浏览器选择覆盖服务端绑定，或把目录刷新视为自动保存和运行。
- **Don't** 把原型硬编码颜色、永久厚焦点圈或截图滚动位置固化为生产规则。
- **Don't** 为这一局部扩展引入独立品牌、卡片矩阵、装饰性字体或额外入场动画。
