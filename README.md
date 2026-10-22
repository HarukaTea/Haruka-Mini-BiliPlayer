# 原神跑图小窗 · haruka-genshin-mini-player

先给你一个**正常的 B 站网页**（自己搜索、自己登录、自己点视频）；
点开视频也还是**普通的 B 站视频页**，不会突然缩窗。想边玩原神边看时，按 `0`
切成 **默认 480×270、左下角、永远置顶、鼠标穿透**的小窗（四角可拖拽缩放），再按一次 `0` 回到浏览窗口；
小窗里按 `9` 进入**沉浸模式**：`0` 停用，`9`、`5`、`6` 和反引号键仍可用；鼠标移到窗口上时整个窗口才变成半透明，移开恢复不透明，既看清视频又不完全挡住游戏文字。

```
① 启动 = 正常浏览窗口（1200×760，能打字能点）
┌─ 哔哩哔哩 ─────────────────────────────┐
│ [搜索]  原神 4.2 大世界探索            │
│  ▷ 视频A    ▷ 视频B    ▷ 视频C         │
└────────────────────────────────────────┘
                ↓ 点开任意视频
② 正常视频页 = 仍是可交互的 B 站页面（可暂停 / 评论 / 换视频）
                ↓ 按 0（可选，手动切小窗）
③ 小窗 = 默认 480×270 左下角置顶 + 鼠标穿透 + 可拖拽缩放
┌─ 原神（无边框窗口化）───────────────────┐
│                                        │
│  ┌─ 小窗 480×270 ─┐                    │
│  │  B 站跑图视频  │  ← 鼠标直接穿过去  │
│  └────────────────┘                    │
└────────────────────────────────────────┘
```

小窗与浏览窗口互切、前进 / 后退、暂停都用热键，见第四节；小窗四个角都可以拖拽缩放。

实际效果：

| 浏览窗口（可搜索、可登录） | 小窗模式（置顶 + 鼠标穿透） |
| --- | --- |
| <img src="docs/screenshots/browse.png" width="620" alt="浏览窗口"> | <img src="docs/screenshots/mini.png" width="380" alt="小窗模式"> |

---

## 一、为什么是这套技术栈

需求里真正的难点不是「放个视频」，而是**它必须能和独占全屏的游戏共存**。

| 约束 | 后果 | 采用的方案 |
| --- | --- | --- |
| 原神「全屏」是独占全屏（DirectFlip），任何 topmost 窗口都压不住 | 必须让用户切「无边框窗口化」 | 无边框 `alwaysOnTop: 'screen-saver'` 窗口 |
| 往游戏里注入 overlay 会被 mhyprot 反作弊拦，且有封号风险 | 走独立进程，绝不碰游戏 | 不注入、不 hook、不读游戏内存 |
| 点小窗会把游戏切到后台，跑图直接断 | 窗口必须不主动抢焦点 + 鼠标穿透 | `setIgnoreMouseEvents(true,{forward:true})` + `showInactive()` |
| 游戏在前台时收不到普通按键 | 必须用系统级热键 | `globalShortcut`（RegisterHotKey），只收不发 |
| 自己写播放器要处理防盗链 / wbi 签名 / 1080P 登录态 / DASH | 工作量暴涨 | 内嵌整页 + `WebContentsView`，用 CSS 裁剪成纯播放器 |

**播放器为什么是「内嵌 B 站网页」而不是自己写：**

B 站的播放链路远比想象的麻烦 —— CDN 有防盗链（要带 `Referer: https://www.bilibili.com`）、
playurl 接口要 [wbi 签名](https://github.com/SocialSisterYi/bilibili-API-collect)、
1080P 以上要登录态 `SESSDATA`、返回的还是音视频分离的 DASH。
自己实现等于重写一个小型播放器（还要处理弹幕），而**直接把整页塞进来再 CSS 裁剪**，
就能白嫖登录态、高画质、弹幕、字幕，代码量少一个数量级。
「浏览页 / 视频页 / 小窗」共用同一套网页，登录一次就长期有效。

其余被否掉的方案：

- **Tauri / C# WPF + WebView2**：能做，但要让 WebView2 天然置顶+穿透+不抢焦点，坑比 Electron 多，且要装 .NET SDK。
- **mpv + yt-dlp + AHK**：最轻，但 yt-dlp 拉 B 站要手动处理 referer/wbi，1080P 也得登录取 Cookie，维护成本高。
- **Chrome 扩展 + Document PiP**：PiP 窗口的**位置不能被代码指定**，做不到「左下角」，直接排除。
- **Chrome `--app` 窗口 + AHK 定位**：可行但丑陋，多一个常驻 AHK 脚本，且没有鼠标穿透。

技术栈：**Electron 45 + TypeScript + `WebContentsView`**，除 Electron 本身外零运行时依赖。

---

## 二、安装与启动

需要 Node.js 22.12+ 和 pnpm（Electron 45 的安装脚本要求）。

```bash
pnpm install
pnpm build
```

只检查类型用 `pnpm typecheck`，清空编译产物用 `pnpm clean`。

启动（二选一）：

- 双击 **`start.cmd`**（首次会自动编译，最省事）
- 命令行 `pnpm start`

启动后就是一个 B 站首页窗口：**搜索框能打字、右上角能登录、视频卡片能点**。
窗口顶栏右上角是自绘的**最小化 / 最大化 / 关闭**按钮，拖动顶栏可以移动窗口、双击最大化或还原。
点开任意视频 → 仍是正常 B 站视频页；需要小窗时按 `0`。

> 如果启动后毫无反应，检查环境变量 `ELECTRON_RUN_AS_NODE` 是否被设置成 `1` 了 ——
> 那会让 electron.exe 退化成纯 Node 解释器，窗口当然出不来。`start.cmd` 已经帮你清掉了。

登录态（`partition: persist:bili`）和配置都放在
`%APPDATA%\haruka-genshin-mini-player\`，删掉这个目录就等于退登 + 清状态。

---

## 三、首次使用（三步）

**1. 让原神切到「无边框窗口化」**

设置 → 图像 → 显示模式 → **无边框窗口化**（或「窗口化」）。
独占全屏下没有任何窗口能盖在游戏上面，这是 Windows 的硬限制，不是这个小工具的锅。
顺便建议把游戏分辨率设成屏幕原生分辨率，无边框窗口化和全屏观感几乎一样。

**2. 搜你想跟的视频，点开它**

视频会在当前窗口正常播放（评论、推荐、暂停都还在）。想边玩边看时按 `0`
切成左下角小窗，再按一次 `0` 回到浏览窗口。小窗四个角各有一个几乎透明的
24px 拖拽区，鼠标移上去会临时接管，拖动即可缩放；松手后恢复鼠标穿透。

**3. 登录（可选，但要 1080P 就必须做）**

未登录最高只有 480P。在浏览窗口里点右上角「登录」扫码即可，登录态会一直留着。
已经在小窗模式时按 `0` 也能回到可交互的浏览窗口。

---

## 四、热键

只保留这几个裸键：

| 功能 | 键 |
| --- | --- |
| 进入 / 退出视频模式（小窗） | `0` |
| 后退 5 秒 | `5` |
| 前进 5 秒 | `6` |
| 播放 / 暂停 | 反引号 `` ` `` |
| 进入 / 退出沉浸模式 | `9` |

**为什么窗口聚焦时也能正常打字**：这些全是裸键，如果无条件注册成系统级全局热键，
搜索框 / 评论框里就再也打不出 `0`、`5`、`6`、`9`、`` ` ``。所以分两条路：

- **窗口在前台**：由页面 preload 捕获；输入框（`input` / `textarea` / `contenteditable`）
  聚焦时直接放行，其余位置才执行动作。
- **窗口失焦（游戏在前台）**：才注册为 `globalShortcut`，这些键全局生效。
- **沉浸模式**：注册 `9`、`5`、`6` 与反引号键，只注销 `0`，避免误触切换小窗。

小窗仍然鼠标穿透、不主动抢焦点（`showInactive()`），但**保留任务栏图标**：点任务栏图标可以把焦点还给小窗，
按 `0` 随时回到浏览窗口。小窗四个角各 24px 是缩放热区，鼠标移上去会临时关闭穿透以接管拖拽。

小窗只保留视频画面：B 站视频上方的「xx 人正在看 / 发个友善的弹幕」输入条、标题栏和页面其它部分都会被裁掉。

浏览窗口是无边框的：顶栏右上角有最小化 / 最大化 / 关闭按钮，也支持 `Alt+F4` 或任务栏右键关闭。

---

## 五、命令行参数

| 参数 | 作用 |
| --- | --- |
| `--resume` | 启动时直接恢复上次看的视频（默认永远从 B 站首页开始） |
| `BV1xx411c7mD` / `?p=3` / 视频链接 | 直接打开某个视频（仍是正常浏览窗口） |
| `--size=640x360` | 换小窗初始尺寸（默认 `480x270`，16:9）。之后可拖四角调整，本次运行内会沿用 |
| `--self-test` | 自检：打印窗口/页面/热键的 JSON 诊断并退出 |
| `--shot=out.png` | 配合 `--self-test`，把画面截图存成 png，方便看渲染结果 |
| `--no-click` | 自检时停在浏览模式，不自动点视频 |
| `--roundtrip` | 自检「浏览 → 点视频（仍是浏览模式）→ 回首页 → 浏览」整条链路 |

```bash
# 例：自检 + 跑一遍完整链路 + 截图
node_modules\electron\dist\electron.exe . --self-test --roundtrip --shot=shot.png
```

---

## 六、实现要点（改代码前值得知道）

代码分层：`src/app.ts`（建窗、页面事件、导航路由、窗口 / 热键 IPC）、`src/modes.ts`（浏览 ⇄ 小窗 ⇄ 沉浸、贴边、置顶看门狗、页面裁剪）、
`src/player.ts`（注入执行与播放控制）、`src/titlebar.ts`（自绘顶栏 HTML/CSS）、`src/preload.ts`（顶栏按钮 IPC + 裸键转发）、
`src/page-preload.ts`（B 站页面裸键转发，输入框放行）、`src/core/`（纯函数：URL / 时间 / 布局，不依赖 Electron）。

- **裸键怎么不挡输入**：窗口聚焦时全局热键是关闭的，`0 / 5 / 6 / 9 / 反引号` 由两个 preload 监听 `keydown`，
  遇到 `input / textarea / contenteditable` 就放行；窗口失焦（游戏在前台）才启用 `globalShortcut`。
  这样既能在游戏里按键，也能在搜索框里正常打「5.0」。

- **两种模式**：`mode: 'browse' | 'mini'`。默认始终是 `browse`，`route(url)` 不再自动切小窗，
  视频页就是普通 B 站页面；只有用户手动进过小窗、又导航到非视频页时，才 `enterBrowse()` 恢复布局。
  `enterMini()` 只由 `0`（`toggleMode()`）或 `9`（先进小窗再进沉浸）触发。URL 认不出来时（活动专题页、番剧特殊路径）
  用 `hasVideo()` 看页面里是否真有在放的 `<video>`，避免手动小窗被误切回浏览。
- **点视频没反应（踩过的坑）**：B 站首页/搜索页的卡片全是 `target="_blank"`，
  原来的 `setWindowOpenHandler(() => ({action:'deny'}))` 会把点击直接吞掉。
  现在改成**在同一个 view 里 `loadURL`**，视频页在原窗口正常打开。
- **先置顶再改尺寸（踩过的坑）**：`setContentSize()` 之后紧跟的 `setAlwaysOnTop()`
  会被 Windows 吞掉，实测 `isAlwaysOnTop()` 一直是 `false`，小窗就压不住游戏。
  现在顺序是 `setAlwaysOnTop` → `moveTop` → `setContentSize`，并在 150/600/1500ms 各补一次，
  另外小窗期间有个 2 秒的看门狗：发现置顶被别的程序顶掉就重新顶回来。
- **切回浏览要撤销裁剪（踩过的坑）**：裁剪任务是 0/400/1200/2500ms 排队的，
  用户切回浏览模式时必须 `clearTimeout` 掉这些任务，并且每个任务执行前再确认一次
  `mode === 'mini'`，否则页面会在浏览模式里被裁成播放器。
- **窗口**：`frame:false` + `hasShadow:false`（浏览 / 小窗都保留任务栏图标，浏览模式可最大化和拉伸）。
  浏览模式 `resizable:true`（否则 Windows 不允许原生最大化）；进入小窗后 `resizable:false` +
  `setMovable(false)`，避免四角热区被 Windows 当成原生 resize / 移动边框，拖拽时触发系统停靠。
  小窗缩放全部走 `setBounds()` 按**外框**计算，不再依赖原生边框。
- **自绘窗口按钮**：36px 顶栏跑在 `BrowserWindow` 自己的 webContents 里（`src/titlebar.ts`），
  浏览模式下 B 站页面所在的 `WebContentsView` 从 36px 开始，小窗模式把 view 拉回 0、顶栏自然被盖住。
  `src/preload.ts` 通过 `contextBridge` 暴露 `window.windowControls`，主进程只处理来自本窗口的 IPC。
- **网页滚动**：浏览器模式下必须保留页面的滚动能力。`BASE_CSS` 只隐藏滚动条，不再写
  `overflow:hidden`；小窗里「禁止滚动」由 `ISOLATE_JS` 的行内 `!important` 单独负责。
- **贴左下角**：用 `screen.getPrimaryDisplay().workArea`（已排除任务栏）定位，
  且用窗口**真实高度**而不是常量再算一次，避免小数缩放屏幕上 DIP 取整累积误差；
  窗口显示后 60ms / 500ms 各校正一次。
- **小窗缩放**：`src/page-preload.ts` 在四个角各 24px 区域内监听 `mousemove / mousedown`。
  悬停时通过 `mini:interactive` 临时关掉鼠标穿透；拖动用 `screenX/Y` 算尺寸，并把
  `nw / ne / sw / se` 一起发给主进程。`resizeMini()` 夹在 `MINI_MIN`（240×135）与工作区之间，
  并以 **mousedown 时的外框为固定锚点**让拖拽角的对角保持不动；不能每帧重新读 `getBounds()`
  再回写，否则 frameless 窗口的 1px 边框取整会逐帧累积，表现为窗口一直向右漂移。

- **沉浸模式（`9`）**：进入后禁用 `0`，保留 `9`、`5`、`6` 与反引号键，窗口 `setIgnoreMouseEvents(true)` +
  `setFocusable(false)`，其它操作全部失效。每 40ms 检查一次鼠标是否在窗口内：鼠标进入时把整窗
  透明度降到 `IMMERSIVE_OPACITY`（默认 `0.4`），移出立刻恢复为 `1`；退出沉浸时也恢复 `1`。页面同时加上
  `dsh-immersive` 类隐藏四角缩放手柄。
  离开 / 松手后恢复穿透。Windows 原生 resize 被关掉，所以不会在拖到屏幕边缘时触发停靠 / Snap。
- **鼠标穿透**：小窗模式 `setIgnoreMouseEvents(true,{forward:true})`，点画面仍然落到游戏；
  只有四个角各 24px 热区会临时接管。窗口保留任务栏图标、可聚焦（点任务栏图标能把焦点还回来）。
  浏览模式切回完全可交互。
- **把网页裁剪成播放器**：注入 `ISOLATE_JS`，找到包含 `<video>` 的播放器根节点，
  提成 `position:fixed; width:100vw; height:100vh`，然后沿祖先链把**所有兄弟节点**隐藏
  （打 `data-dsh-hidden` 标记），最后隐藏 `body` 里其它顶层节点。
  这样顶部导航、右侧推荐、评论区、底栏全消失，只剩播放器。`UNISOLATE_JS` 负责原样还原。
- **视频铺满（踩过的坑）**：B 站播放器会用自己的算法给 `<video>` 和几层包裹元素
  **写死行内 px 尺寸**（480×270 的窗口里可能算成 320×180，四周一圈黑边）。
  普通样式表 `!important` 压不住，所以在 `ISOLATE_JS` 里从 `<video>` 往上逐层
  `style.setProperty(..., 'important')` 强制 `width/height:100%` + `object-fit:contain`。
  注意**不能把这套规则用到播放器根节点上**，否则会把它的 `position:fixed` 覆盖成 `absolute`，定位直接跑偏。
- **裁剪时机**：进入小窗后立刻、以及 0/400/1200/2500ms 各重跑一次（播放器是异步挂载的）。
- **控制**：所有操作都是 `webContents.executeJavaScript` 直接操作 `document.querySelector('video')`
  的 `paused / currentTime / volume / playbackRate`，不依赖 B 站内部的任何 API，改版也不容易坏。
  `--self-test` 会临时改音量 / 倍速，结束前恢复原值，避免 B 站把「音量 0」记进本地配置。
- **登录态**：`partition: 'persist:bili'`，登录一次长期有效，存在 userData 里。

---

## 七、已知限制

- **只能在 Windows 上用**：全局热键、置顶层级、鼠标穿透的行为都是按 Windows 调的。
- **主显示器左下角**：定位用的是主屏；副屏需要的话把 `src/app.ts` / `src/modes.ts` 里的 `getPrimaryDisplay()` 换成目标屏幕。
- **小窗位置固定**：左下角，不可拖动位置；但大小可以拖四角调整（240×135 起，最大不超出工作区）。
  浏览窗口无边框、自动居中，关闭用顶栏右上角 ×、`Alt+F4` 或任务栏右键。
- **未登录只有 480P**：B 站策略，不是本程序的限制，按第三节第 3 步登录即可。
- **小窗需手动进入**：点开视频默认保持正常 B 站页面；想边玩边看时按 `0` 切成小窗，再按 `0` 回来。
  小窗里按 `9` 进入沉浸模式（`0` 停用，`5/6`/反引号仍可用，鼠标移入才半透明），再按 `9` 退出。
- **小窗和游戏抢 GPU**：小窗播放会占用一点 GPU 解码资源，跑图时如果掉帧，可以按 `0` 退出小窗。

---

## 八、文件结构

```
src/
  main.ts        入口：应用生命周期、单实例、热键与自检装配
  app.ts         主控制器：建窗 / WebContentsView / 导航路由 / 窗口按钮 IPC
  modes.ts       浏览 ⇄ 小窗 ⇄ 沉浸：尺寸、贴边、置顶看门狗、页面裁剪、悬停半透明
  titlebar.ts    自绘顶栏的 HTML / CSS（最小化 / 最大化 / 关闭）
  preload.ts     顶栏 preload：窗口按钮 IPC + 顶栏聚焦时的裸键转发
  page-preload.ts B 站页面 preload：窗口聚焦时转发 0 / 5 / 6 / 9 / `（输入框放行）
  player.ts      页面桥接：执行注入脚本、播放 / 音量 / 倍速、OSD 提示
  injected.ts    注入到 B 站页面里的隔离 / 还原脚本与基础 CSS
  hotkeys.ts     裸键的全局注册 + 普通 / 沉浸 / 关闭三种启停模式
  selftest.ts    --self-test 诊断、截图、roundtrip
  cli.ts         命令行参数解析
  config.ts      userData/config.json 读写（上次播放地址）
  constants.ts   窗口尺寸 / 首页地址 / UA / Mode 类型
  core/
    url.ts       视频 URL 识别与输入归一化（BV / av / 链接）
    format.ts    秒数 → mm:ss
    layout.ts    纯窗口布局计算（居中、贴左下角、浏览窗口尺寸）
tools/
  probes/        一次性探测脚本（热键占用、置顶行为），见 tools/README.md
docs/
  screenshots/   效果图
scripts/
  launch.mjs     启动器：清理 ELECTRON_RUN_AS_NODE；修复 Electron 目录 ACL；仍失败才用 --no-sandbox 重试
start.cmd        双击启动
dist/            编译输出（tsc 生成的一整组 js）
```

改完代码记得 `pnpm build`；只检查类型用 `pnpm typecheck`，清空产物用 `pnpm clean`。
`start.cmd` 只在 `dist/main.js` 不存在时才自动编译，所以改了代码请手动 build 一次。

如果 `pnpm start` 遇到 Chromium 沙箱初始化失败（退出码 `-2147483645` / `0x80000003`），
`scripts/launch.mjs` 会先检查 Electron 安装目录：工作区把 `node_modules/electron/dist`
继承成 Low 完整性级别、或缺少 `ALL APPLICATION PACKAGES` 读取权限时，Chromium 的沙箱
进程会在启动阶段直接退出。启动器会把该目录恢复为 Medium 完整性并补上 AppContainer
读取权限，然后重新用沙箱启动；只有修复后仍失败，才退回 `--no-sandbox`（仅影响当前进程）。

可以手动检查：

```powershell
icacls node_modules\electron\dist | Select-String "Mandatory|APPLICATION"
```

看到 `Low Mandatory Level` 就说明需要修复；正常应看不到 Low 标签，并且有
`ALL APPLICATION PACKAGES` 的读取权限。
