import './PullToRefresh.css'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, RotateCw } from 'lucide-react'

const SYNC_THRESHOLD = 70
const RELOAD_THRESHOLD = 112
const MAX_PULL = 145
const HOLD_MS = 1000

export default function PullToRefresh({ onRefresh, disabled = false }) {
  const start = useRef(null)
  const refreshingRef = useRef(false)
  const distanceRef = useRef(0)
  const holdTimer = useRef(null)
  const reloadArmed = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (disabled) return

    const blockedSelector = [
      'input', 'textarea', 'select', '[contenteditable="true"]',
      '.modal-body', '.food-list', '.suggestions-dropdown',
      '.tab-navigation', '.tab-dragging'
    ].join(', ')

    function clearHold() {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
      holdTimer.current = null
    }

    function resetPull() {
      clearHold()
      reloadArmed.current = false
      setArmed(false)
      distanceRef.current = 0
      setDistance(0)
    }

    function updateDistance(value) {
      distanceRef.current = value
      setDistance(value)
      if (value < RELOAD_THRESHOLD) {
        clearHold()
        reloadArmed.current = false
        setArmed(false)
      } else if (!reloadArmed.current && holdTimer.current === null) {
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null
          if (!start.current || distanceRef.current < RELOAD_THRESHOLD || refreshingRef.current) return
          reloadArmed.current = true
          setArmed(true)
          if (navigator.vibrate) navigator.vibrate(30)
        }, HOLD_MS)
      }
    }

    function isInsideScrollableArea(target) {
      let element = target
      while (element && element !== document.body) {
        if (element instanceof Element) {
          const style = window.getComputedStyle(element)
          if (['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight) return true
        }
        element = element.parentElement
      }
      return false
    }

    function onStart(event) {
      start.current = null
      resetPull()
      if (refreshingRef.current || event.touches.length !== 1 || window.scrollY > 0) return
      if (!(event.target instanceof Element) || event.target.closest(blockedSelector)) return
      if (isInsideScrollableArea(event.target)) return
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }

    function onMove(event) {
      if (!start.current || event.touches.length !== 1) return
      const dx = event.touches[0].clientX - start.current.x
      const dy = event.touches[0].clientY - start.current.y
      if (Math.abs(dx) > Math.abs(dy)) {
        start.current = null
        resetPull()
        return
      }
      if (dy <= 0 || window.scrollY > 0) {
        resetPull()
        return
      }
      updateDistance(Math.min(MAX_PULL, dy * 0.55))
      if (event.cancelable) event.preventDefault()
    }

    async function onEnd() {
      if (!start.current) return
      const shouldReload = reloadArmed.current
      const shouldSync = distanceRef.current >= SYNC_THRESHOLD
      start.current = null
      resetPull()
      if (refreshingRef.current) return
      if (shouldReload) {
        refreshingRef.current = true
        setReloading(true)
        window.location.reload()
        return
      }
      if (!shouldSync) return
      refreshingRef.current = true
      setRefreshing(true)
      setError('')
      try {
        await onRefreshRef.current()
      } catch (err) {
        setError(err?.message || 'Unable to refresh. Please try again.')
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
      }
    }

    function onCancel() {
      start.current = null
      resetPull()
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      clearHold()
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [disabled])

  if (!refreshing && !reloading && distance === 0 && !error) return null
  const label = error || (reloading ? 'Reloading page…' : refreshing ? 'Syncing all data…' : armed ? 'Release to reload page' : distance >= RELOAD_THRESHOLD ? 'Hold to reload page' : distance >= SYNC_THRESHOLD ? 'Release to sync data' : 'Pull to refresh')
  return (
    <div className="nutrilog-pull-indicator" role="status" aria-live="polite">
      {armed || reloading ? <RotateCw size={18} className={reloading ? 'nutrilog-pull-spinning' : ''} /> : <RefreshCw size={18} className={refreshing ? 'nutrilog-pull-spinning' : ''} />}
      <span>{label}</span>
      {distance > 0 && !refreshing && !reloading && <span className="nutrilog-pull-progress" aria-hidden="true" style={{ width: Math.min(100, distance / RELOAD_THRESHOLD * 100) + '%' }} />}
    </div>
  )
}
