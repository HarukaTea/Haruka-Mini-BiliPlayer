# 调试脚本

一次性排查用的 Electron 小脚本，不参与构建，直接用项目自带的 Electron 跑：

```bat
node_modules\electron\dist\electron.exe tools\probes\hotkeys.js
```

| 脚本 | 用途 |
| --- | --- |
| `probes/hotkeys.js` | 列出本机哪些候选全局热键还能注册（被占用时主程序会自动换备用键） |
| `probes/topmost-basic.js` | 空窗口逐步切换「置顶 / 跳过任务栏 / 不可聚焦 / 鼠标穿透」，观察 `isAlwaysOnTop()` 在哪一步被吃掉 |
| `probes/topmost-with-view.js` | 复现主程序（浏览窗口 + `WebContentsView`）切小窗的完整流程，定位置顶丢失点 |

排查结论已经写进 README「实现要点」一节，这些脚本平时不用跑。
