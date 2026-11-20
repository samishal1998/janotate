import {
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react'

type Transport = {
  group: string
  path: string
  status: string
  action: string
  toggle: () => void
  stop: () => void
}
const playback = new Map<string, Transport>()
const listeners = new Map<string, Set<() => void>>()

// Guide controls delegate to the mounted item's real transport. Publish only
// meaningful state transitions, rather than rerendering the rail on every frame.
export function useReportPlayback(
  item: string,
  group: string,
  path: string,
  status: string,
  action: string,
  toggle: () => void,
  stop: () => void,
) {
  const control = useRef({ toggle, stop })
  control.current = { toggle, stop }
  useLayoutEffect(() => {
    if (!group) return
    const value = {
      group,
      path,
      status,
      action,
      toggle: () => control.current.toggle(),
      stop: () => control.current.stop(),
    }
    playback.set(item, value)
    listeners.get(item)?.forEach((f) => f())
    return () => {
      if (playback.get(item) === value) {
        playback.delete(item)
        listeners.get(item)?.forEach((f) => f())
      }
    }
  }, [item, group, path, status, action])
}

export function useGuidePlayback(item?: string) {
  const subscribe = useCallback(
    (update: () => void) => {
      if (!item) return () => {}
      const group = listeners.get(item) ?? new Set()
      listeners.set(item, group)
      group.add(update)
      return () => {
        group.delete(update)
        if (!group.size) listeners.delete(item)
      }
    },
    [item],
  )
  return useSyncExternalStore(subscribe, () => playback.get(item) ?? null)
}
