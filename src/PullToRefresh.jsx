import './PullToRefresh.css'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 75
const MAX_PULL = 110

export default function PullToRefresh({ onRefresh, disabled = false }) {
  const start = useRef(null)
  const refreshingRef = useRef(false)
  const distanceRef = useRef(0)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (disabled) return

    const blockedSelector = [
      'input', 'textarea', 'select', '[contenteditable="true"]',
      '.modal-body', '.food-list', '.suggestions-dropdown',
      '.tab-navigation', '.tab-dragging'
    ].join(', ')

    function updateDistance(value) {
      distanceRef.current = value
      setDistance(value)
    }

    function isInsideScrollableArea(target) {
      let element = target

      while (element && element !== document.body) {
        if (element instanceof Element) {
          const style = window.getComputedStyle(element)
          const overflow = style.overflowY

          if (
            (overflow === 'auto' || overflow === 'scroll') &&
            element.scrollHeight > element.clientHeight
          ) {
            return true
          }
        }
        element = element.parentElement
      }

      return false
    }

    function onStart(event) {
      start.current = null
      updateDistance(0)
      if (refreshingRef.current || event.touches.length !== 1) return
      if (window.scrollY > 0) return
      if (!(event.target instanceof Element)) return
      if (event.target.closest(blockedSelector)) return
      if (isInsideScrollableArea(event.target)) return

      start.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      }
    }

    function onMove(event) {
      if (!start.current || event.touches.length !== 1) return

      const dx = event.touches[0].clientX - start.current.x
      const dy = event.touches[0].clientY - start.current.y

      if (Math.abs(dx) > Math.abs(dy)) {
        start.current = null
        updateDistance(0)
        return
      }

      if (dy <= 0 || window.scrollY > 0) {
        updateDistance(0)
        return
      }

      const pull = Math.min(MAX_PULL, dy * 0.55)
      updateDistance(pull)

      if (event.cancelable) event.preventDefault()
    }

    async function onEnd() {
      if (!start.current) return
      start.current = null

      const shouldRefresh = distanceRef.current >= THRESHOLD
      updateDistance(0)

      if (!shouldRefresh || refreshingRef.current) return

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
      updateDistance(0)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onCancel)

    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [disabled])

  if (!refreshing && distance === 0 && !error) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        padding: '9px 14px',
        borderRadius: 24,
        background: '#1b2422',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 3px 14px #0003'
      }}
    >
      <RefreshCw
        size={17}
        style={refreshing ? {
          animation: 'nutrilog-refresh-spin 0.8s linear infinite'
        } : undefined}
      />
      <span>
        {error || (refreshing ? 'Refreshing…' : distance >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh')}
      </span>
    </div>
  )
}
