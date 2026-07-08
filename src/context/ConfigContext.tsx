import { createContext, useContext, useMemo, useState, ReactNode } from 'react'
import { AppConfig, loadConfig, saveConfig } from '../models/config'

interface ConfigCtx {
  config: AppConfig
  update: (patch: Partial<AppConfig>) => void
  replace: (next: AppConfig) => void
}

const Ctx = createContext<ConfigCtx | null>(null)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())

  const value = useMemo<ConfigCtx>(
    () => ({
      config,
      update: (patch) =>
        setConfig((prev) => {
          const next = { ...prev, ...patch }
          saveConfig(next)
          return next
        }),
      replace: (next) => {
        saveConfig(next)
        setConfig(next)
      },
    }),
    [config],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConfig(): ConfigCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConfig outside ConfigProvider')
  return v
}
