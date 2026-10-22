/**
 * Electron 启动器
 *
 * 解决两个环境问题，保证 `pnpm start` 双击就能出窗口：
 *  1. 从某些终端（或 CI）继承 ELECTRON_RUN_AS_NODE=1 时，electron.exe 会退化成
 *     普通 Node，`require('electron').app` 是 undefined，主进程直接崩。
 *  2. 工作区把 node_modules 继承成 Low 完整性级别、且缺少 AppContainer 读取
 *     权限时，Chromium 沙箱会以 STATUS_BREAKPOINT（0x80000003 /
 *     -2147483645 / 3）静默退出。先修复 Electron 目录的 ACL 再重试；
 *     仍失败才退到 --no-sandbox（只影响当前进程）。
 *
 * 用法与 electron 一致：`node scripts/launch.mjs [--self-test] [--shot=...]`
 */
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const rawArgs = process.argv.slice(2)
// 应用自己的参数必须放在 `.` 之后；Chromium 开关放在 `.` 之前。
// 否则 Electron 的 argv[1] 会变成开关，main.ts 里 slice(2) 会漏掉第一个参数。
const APP_FLAG = /^(--self-test$|--no-click$|--roundtrip$|--resume$|--shot=|--initial=|--size=)/
const isAppArg = (arg) => APP_FLAG.test(arg)
const switches = rawArgs.filter((arg) => arg.startsWith('-') && !isAppArg(arg))
const appArgs = rawArgs.filter((arg) => !arg.startsWith('-') || isAppArg(arg))
const baseArgs = [...switches, '.', ...appArgs]

const SANDBOX_CRASH = new Set([3, -2147483645, 2147483651, 3221225475])

/**
 * 工作区若把 node_modules 继承成 Low 完整性级别，Chromium 的沙箱进程会
 * 在启动时直接 STATUS_BREAKPOINT。把 Electron 目录恢复为 Medium，并补上
 * AppContainer 的读取/执行权限，通常就能让沙箱正常初始化。
 */
function repairElectronAcl() {
  if (process.platform !== 'win32') return false

  const dist = path.dirname(electronPath)
  let changed = false

  try {
    const exeAcl = execFileSync('icacls', [electronPath], { encoding: 'utf8', windowsHide: true })
    const dirAcl = execFileSync('icacls', [dist], { encoding: 'utf8', windowsHide: true })
    const lowIntegrity = /Low Mandatory Level|低强制级别/i.test(exeAcl + dirAcl)

    if (lowIntegrity) {
      execFileSync(
        'icacls',
        [dist, '/setintegritylevel', 'Medium', '/T', '/C', '/Q'],
        { windowsHide: true, stdio: 'ignore' }
      )
      changed = true
    }

    const hasAppPackages = /ALL APPLICATION PACKAGES|所有应用程序包/i.test(dirAcl)
    if (!hasAppPackages) {
      for (const sid of ['S-1-15-2-1', 'S-1-15-2-2']) {
        try {
          execFileSync(
            'icacls',
            [dist, '/grant', `*${sid}:(OI)(CI)(RX)`, '/T', '/C', '/Q'],
            { windowsHide: true, stdio: 'ignore' }
          )
          changed = true
        } catch {
          // 没有改 ACL 的权限时放弃，后面还有 --no-sandbox 兜底
        }
      }
    }
  } catch (error) {
    console.warn('[launcher] 检查 Electron ACL 失败:', error.message)
    return false
  }

  if (changed) {
    console.log('[launcher] 已修复 Electron 沙箱 ACL（Low IL → Medium）')
  }
  return changed
}

function run(args) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(electronPath, args, { stdio: 'inherit', env })
    child.on('error', (error) => {
      console.error('[launcher] 无法启动 electron:', error.message)
      resolve({ code: 1, elapsed: 0 })
    })
    child.on('exit', (code, signal) => {
      resolve({
        code: code ?? (signal ? 1 : 0),
        signal,
        elapsed: Date.now() - startedAt,
      })
    })
  })
}

const first = await run(baseArgs)
if (
  (SANDBOX_CRASH.has(first.code) || first.signal === 'SIGTRAP') &&
  first.elapsed < 10_000
) {
  if (repairElectronAcl()) {
    console.log('[launcher] 用修复后的 ACL 重试沙箱启动…')
    const repaired = await run(baseArgs)
    if (!SANDBOX_CRASH.has(repaired.code) && repaired.signal !== 'SIGTRAP') {
      process.exit(repaired.code)
    }
  }

  console.warn('[launcher] Electron 沙箱初始化失败，改用 --no-sandbox 重试…')
  const retry = await run(['--no-sandbox', ...baseArgs])
  process.exit(retry.code)
}
process.exit(first.code)
