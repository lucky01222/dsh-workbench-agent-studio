# Compatibility verification / 兼容验证

Last checked: 2026-10-17. This records observed behavior for specific artifacts; it does not expand the declared host range to untested releases.

| Application | Version | Result |
|---|---|---|
| Official DSH Web | 0.1.7-rc.2 | Host regression suite passed |
| Official DSH Web | 0.2.0-rc.2 | Host regression suite, clean installation and browser flow passed |
| Official DSH Desktop, macOS Apple Silicon | 0.2.0-rc.2 | Native window, bundled CLI, trial, export and reinstall checks below passed |
| Windows / Intel Mac Desktop | — | Not tested |
| DSH alpha | 0.2.1-alpha.5 | Not supported: removed `both` mode and changed PTC behavior |

The tested plugin artifacts are **Agent Studio 1.13.3** and **runtime 1.10.5**, from the existing GitHub Release. No application code or release archive was changed for this additional verification.

## Official macOS desktop test

The installer came from the [official download page](https://www.deepseek.com/download/). Its app and embedded DSH both identified as 0.2.0-rc.2; the packaged runtime reported Node 24.18.1 and pnpm 11.7.0. The app's code signature passed verification. Harness data and Electron browser data were isolated from the normal installation.

Verified with only Studio and a local scripted-model fixture installed:

- Create and save an Agent; bind the official file plugin to the exact `read` tool.
- Read a synthetic file through the real tool, edit the tool result in the native desktop window, and continue the model using the edited content.
- Preserve old runs and export a standalone preset.
- Run that desktop-generated export in a second clean profile, using the desktop-bundled CLI and standalone runtime without Studio Service/UI. The Agent only exposed `read` and completed the file-reading task.
- Without Library installed, return `not-needed` for its compatibility migration.
- Fully quit Desktop, uninstall Studio with its bundled CLI, reopen and confirm the Studio entry and API are absent; reinstall and confirm the saved Agent and run history remain.

The scripted model tests the application and tool contracts; it is not evidence of external-model quality. No external model call was part of this verification. This does not cover every OS, window size or optional plugin combination.

## Desktop installation differs from Web

Desktop owns the `desktop` profile. Its embedded CLI can manage that profile; an npm-installed CLI cannot substitute for it.

1. Launch Desktop once to initialize its profile, then **fully quit** it.
2. Use Desktop's **Manage dsh Command…** menu if you want to install its bundled CLI. Check `dsh --version` and which executable your shell resolves.
3. Install into the desktop profile with that bundled command:

```sh
dsh plugin --profile desktop add /path/to/dsh-workbench-agent-studio-1.13.3.tgz
```

4. Reopen Desktop. Keep the same `DSH_HOME` if you use a custom data directory.

See the [official desktop documentation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md#bundled-command-runtime) for command installation and ownership.

## Navigation and theme boundaries

A subsequent coexistence smoke loaded navigation 1.11.3 and theme 1.3.4 with Studio in the same isolated desktop profile. Studio remained available and the theme's light palette and artwork rendered.

**The navigation plugin deliberately skips its 56px Web rail on native macOS and Windows titlebar layouts.** Desktop therefore keeps its official sidebar. This is an existing code guard, not a failed installation, and the Web rail must not be advertised as a desktop feature. The coexistence smoke does not establish a full desktop theme/animation matrix.

## 中文要点

- 已补充验证官方 **macOS Apple Silicon 桌面版 0.2.0-rc.2**，使用正式 Release 中的工作室 1.13.3 / runtime 1.10.5；没有重打或替换发布包。
- 原生窗口完成真实文件工具调用、工具结果编辑与继续；独立导入和卸载重装保留数据通过。没有资料库时正常工作。
- 安装使用桌面版自带的 `dsh`，目标为 `--profile desktop`，安装前完全退出应用。不能用普通 npm CLI 管理桌面专属配置。
- 导航的 56px 应用栏只适用于 Web，原生桌面保留官方侧栏；主题与工作室共存加载通过，不代表所有动画和窗口尺寸都已测完。
- Windows、Intel Mac、alpha 及真实外部模型效果均不在本次验证结论中。
