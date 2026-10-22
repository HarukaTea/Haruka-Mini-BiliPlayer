import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** 落盘的配置（目前只有上次播放的地址） */
export interface AppConfig {
  lastUrl?: string
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8')) as AppConfig
  } catch {
    return {}
  }
}

export function writeConfig(patch: Partial<AppConfig>): void {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true })
    fs.writeFileSync(configPath(), JSON.stringify({ ...readConfig(), ...patch }, null, 2))
  } catch {
    /* 配置写失败不影响主流程 */
  }
}
