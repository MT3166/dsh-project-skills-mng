# dsh-project-skills

[![test](https://github.com/MT3166/dsh-project-skills-mng/actions/workflows/test.yml/badge.svg)](https://github.com/MT3166/dsh-project-skills-mng/actions/workflows/test.yml)

在 DSH 右侧栏浏览与管理**项目级技能**（project skills）和**全局技能**（global skills）。

DSH 原生已经会在会话里发现技能文件：项目技能位于 `<projectRoot>/.dsh/skills` 与
`<projectRoot>/.agents/skills`，全局技能位于 `~/.dsh/skills` 与 `~/.agents/skills`。
但这个发现过程对用户不可见，也没有 GUI 可以增删改。本插件补上这一层：

- 右栏 guide 页常驻入口「项目技能」，点开才展开面板，不会自己弹出来；
- 面板按 **Project / Global** 分组列出当前会话生效的技能，显示来源目录、相对路径、
  模型可调用（M）/ 用户可调用（U）标记，以及同名的**被覆盖**条目；被覆盖的条目照样
  可以打开、编辑、删除——操作落在它自己所在的根上，不会动到胜出的那条同名技能；
- 支持新建、编辑、删除 `SKILL.md`，切换两个调用开关，frontmatter 校验与
  frontmatter 之外正文的原样保留；
- 同时注册一个 `skills_manage` 工具，让模型可以复用同一套读写逻辑。

面板只读写技能文件本身，不重建技能注册表——DSH 的 `@deepseek-ai/dsh-skill-filesystem`
已经在监听这些目录，保存后模型侧会自动看到新内容。

## 安装

仓库地址：<https://github.com/MT3166/dsh-project-skills-mng>

```text
git clone git@github.com:MT3166/dsh-project-skills-mng.git
```

在 DSH 里安装克隆下来的目录（bundle 包）：

```text
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

新装 bundle 由 HMR 直接生效；若是替换已安装的旧版本，需要重启 DSH 才会加载新的 JS。

## 面板

1. 会话打开右侧栏（`Ctrl+Shift+E` 一类的右栏开关），点「+」或 guide 页卡片
   「项目技能」；
2. 顶部切换 **Project N / Global M** 分组，点任意一行进入详情；
3. 详情里可以直接编辑 SKILL.md 正文与 frontmatter，保存后列表自动刷新；
4. 工具栏可以刷新与新建技能（名称 + 描述生成 frontmatter 模板，再手动补正文）。

## 安全边界

- 所有路径先过技能名白名单（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），再做 realpath 校验，
  写操作只允许落在上述四个技能根目录内；
- 写入是 tmp 文件 + rename 的原子替换，且写前回读校验 frontmatter；
- 删除只作用于解析后的 `SKILL.md` 所在技能目录，UI 会二次确认。

## 验证

- `test/host.test.mjs`（12 项）：假 ctx 覆盖 list 分组/覆盖判定、按 rootId 读取被覆盖技能、
  write→read 往返、toggle 保留正文、平铺 `<name>.md` 原地覆盖、`skills_manage` 的
  create/update→write 映射、delete、非法名（`../escape`、`a/b`、`UPPER`、空名）、
  frontmatter 名不匹配、缺失根可写、未知会话返回 `SESSION_NOT_FOUND`。
- `test/client.smoke.mjs`（12 项）：模块表格式、tab 类型/guide 卡片注册、pane body 槽注册、
  zh/en key 对齐、样式注入与清理、空态零请求、相对 URL + sessionId、分组渲染、
  详情→toggle→编辑→保存往返、新建模板、被覆盖行按自身 rootId 读取/删除/编辑。
- `test/probe.mjs`：在真实 `~/.dsh/skills`、`~/.agents/skills` 上跑完整 list，得到
  `{project:1, global:44, total:45, shadowed:20, broken:0}`（20 条同名覆盖按 rank 正确标出）。
- 真实 GUI：右栏 guide 卡片「项目技能」点开即面板，Project/Global 分组正常。
- 仓库内 `.dsh/skills/demo-skill` 是验证用的项目技能样本，删掉不影响插件，也不在 npm `files` 里。

## 开发

```text
node --test test/host.test.mjs
node --test test/client.smoke.mjs
node test/probe.mjs
```

改面板样式时不必反复重启 DSH：`test/preview.mjs` 会用真实的主题 token（从
`@deepseek-ai/dsh-client-ui-theme` 抽出）与一个迷你 React 把 `client.js` 渲染成静态 HTML，
输出到 `test/preview-out/`（`list|detail|edit|create|empty` × `light|dark`），
再用本机 Edge/Chrome headless 截图查看效果：

```text
node test/preview.mjs
msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 ^
  --window-size=420,830 --user-data-dir=%TEMP%\edgeshot-list-light ^
  --screenshot=test\preview-out\list-light.png ^
  "file:///%CD%/test/preview-out/list-light.html"
```

- `index.js` — Host 半边：`/dsh-project-skills/api` 路由（roots/list/read/write/delete/toggle）
  与 `skills_manage` 工具；
- `client.js` — Web 客户端半边：右栏 tab 类型、guide 卡片、面板 UI（模块表格式，
  React 由 DSH 浏览器侧提供）；
- `cordis.patch.yml` — 把 `dsh-project-skills` 这一行插入 profile；
- `locale/{en,zh}.json` — bundle 的标题/描述；
- `docs/superpowers/plans/` — 设计与实现计划。

## License

MIT © 2026 MT3166，见 [LICENSE](./LICENSE)。
