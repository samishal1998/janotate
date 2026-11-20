import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React, { useLayoutEffect, useState } from 'react'

export function Appearance() {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('janotate.appearance') || 'system'
    } catch {
      return 'system'
    }
  })
  useLayoutEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        mode === 'system' ? (system.matches ? 'dark' : 'light') : mode
    }
    apply()
    system.addEventListener('change', apply)
    try {
      localStorage.setItem('janotate.appearance', mode)
    } catch {}
    return () => system.removeEventListener('change', apply)
  }, [mode])
  return (
    <label className="appearance">
      <span className="appearance-caption">Appearance</span>
      <NativeSelect
        size="sm"
        aria-label="Appearance"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <NativeSelectOption value="system">System</NativeSelectOption>
        <NativeSelectOption value="light">Light</NativeSelectOption>
        <NativeSelectOption value="dark">Dark</NativeSelectOption>
      </NativeSelect>
    </label>
  )
}
