import { useEffect, useRef, useState } from 'react'
import type { JazzState, JazzConfig, ModelSize } from '../../shared/types'
import { OVERLAY } from '../../shared/constants'

const MODEL_BADGE: Record<ModelSize, string> = {
  'tiny.en': 'tiny',
  'base.en': 'base',
  'small.en': 'small',
  'small.en-q5_1': 'small-q5',
  'medium.en': 'medium',
  'large-v3-turbo-q5_0': 'turbo-q5',
  'large-v3-turbo-q8_0': 'turbo-q8',
  'large-v3-turbo': 'turbo-gpu'
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Waveform(): JSX.Element {
  return (
    <div className="flex items-center gap-[3px] h-4 mx-1">
      <div className="w-[2px] bg-primary rounded-full animate-wave-1" />
      <div className="w-[2px] bg-primary rounded-full animate-wave-2" />
      <div className="w-[2px] bg-primary rounded-full animate-wave-3" />
      <div className="w-[2px] bg-primary rounded-full animate-wave-4" />
      <div className="w-[2px] bg-primary rounded-full animate-wave-5" />
    </div>
  )
}

export default function Overlay(): JSX.Element {
  const isLinux = navigator.userAgent.includes('Linux')
  const [state, setState] = useState<JazzState>('idle')
  const [text, setText] = useState<string>('')
  const [config, setConfig] = useState<JazzConfig | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)
  const recordStart = useRef<number>(0)

  // Pill DOM element — its bounds get sent to main so the OS window is resized
  // to fit exactly (no transparent dead zone that would capture stray clicks).
  const pillRef = useRef<HTMLDivElement | null>(null)

  // Drag state. Main pins the window under the cursor while dragging; here we
  // only decide click-vs-drag (a sub-threshold move = a click = toggle).
  const dragging = useRef(false)
  const moved = useRef(0)

  useEffect(() => {
    const el = pillRef.current
    if (!el) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.jazz.setPillBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height)
      })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [state, text])

  useEffect(() => {
    void window.jazz.getConfig().then(setConfig)
  }, [])

  useEffect(() => {
    return window.jazz.onOverlayState((s, t) => {
      setState(s as JazzState)
      if (t !== undefined) setText(t)
      if (s === 'recording') {
        recordStart.current = Date.now()
        setElapsed(0)
      }
    })
  }, [])

  useEffect(() => {
    if (state !== 'recording') return
    const id = setInterval(() => setElapsed(Date.now() - recordStart.current), 250)
    return () => clearInterval(id)
  }, [state])

  // End-drag is bound to the WINDOW (not the pill) so we never miss the
  // button-release if the pill briefly slips out from under the cursor on X11.
  // Combined with the main-side wall-clock guard, the orb can never get stuck
  // chasing the cursor — the core failure of earlier attempts.
  useEffect(() => {
    function finishDrag(): void {
      if (!dragging.current) return
      dragging.current = false
      window.jazz.endOverlayDrag()
      if (moved.current < OVERLAY.DRAG_THRESHOLD) window.jazz.toggleListening()
    }
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    window.addEventListener('blur', finishDrag)
    return () => {
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      window.removeEventListener('blur', finishDrag)
    }
  }, [])

  function onPointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return
    dragging.current = true
    moved.current = 0
    // Capture so pointermove/up keep arriving even if the pill momentarily slips
    // out from under the cursor during a fast flick.
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
    window.jazz.beginOverlayDrag()
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!dragging.current) return
    moved.current += Math.abs(e.movementX) + Math.abs(e.movementY)
  }

  const modelBadge = config ? MODEL_BADGE[config.activeModel] : 'jazz'

  // Per-state pill styling (border/shadow accents change with state).
  const borderClass =
    state === 'recording' || state === 'injecting'
      ? 'border-primary/30'
      : state === 'error'
        ? 'border-error/30'
        : 'border-white/10'

  // Subtle lift only — no heavy halo. Violet glow stays for active states.
  const shadowClass =
    state === 'recording'
      ? 'shadow-glow'
      : state === 'injecting'
        ? 'shadow-[0_2px_12px_rgba(196,74,240,0.18)]'
        : state === 'error'
          ? 'shadow-[0_2px_12px_rgba(147,0,10,0.25)]'
          : 'shadow-[0_1px_4px_rgba(0,0,0,0.25)]'

  const bgClass =
    state === 'error'
      ? 'bg-error-container/20'
      : 'bg-surface-container/80'

  if (isLinux) {
    const icon =
      state === 'transcribing'
        ? 'progress_activity'
        : state === 'injecting'
          ? 'edit_note'
          : state === 'success'
            ? 'check_circle'
            : state === 'error'
              ? 'warning'
              : 'mic'

    return (
      <div className="fixed inset-0 flex items-start justify-start select-none overflow-hidden">
        <div
          ref={pillRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          title="Click to toggle listening · drag to move"
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full backdrop-blur-glass border cursor-pointer overflow-hidden ${borderClass} ${bgClass}`}
        >
          {state === 'recording' && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(196,74,240,0.6)]" />
          )}
          <span
            className={`material-symbols-outlined ${state === 'idle' || state === 'success' || state === 'error' ? 'filled' : ''} text-[22px] ${
              state === 'recording' || state === 'injecting'
                ? 'text-primary'
                : state === 'error'
                  ? 'text-error'
                  : 'text-on-surface'
            } ${state === 'transcribing' ? 'animate-spin' : ''}`}
          >
            {icon}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-0 left-0 max-w-full max-h-full p-[1px] select-none overflow-hidden">
      <div
        ref={pillRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        title="Click to toggle listening · drag to move"
        className={`animate-fade-in inline-flex max-w-[272px] items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-glass border cursor-pointer overflow-hidden ${borderClass} ${shadowClass} ${bgClass}`}
      >
        {state === 'idle' && (
          <>
            <span className="material-symbols-outlined filled text-[18px] text-on-surface">mic</span>
            <span className="text-label-md text-on-surface">{modelBadge}</span>
          </>
        )}

        {state === 'recording' && (
          <>
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(196,74,240,0.6)] ml-0.5" />
            <Waveform />
            <span className="text-label-md text-primary font-medium tabular-nums whitespace-nowrap truncate">
              Listening {fmtElapsed(elapsed)}
            </span>
          </>
        )}

        {state === 'transcribing' && (
          <>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant animate-spin">progress_activity</span>
            <span className="text-label-md text-on-surface-variant pr-0.5">Transcribing…</span>
          </>
        )}

        {state === 'injecting' && (
          <>
            <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
            <span className="text-label-md text-primary truncate max-w-[180px]">{text || 'Inserting…'}</span>
          </>
        )}

        {state === 'success' && (
          <>
            <span className="material-symbols-outlined filled text-[18px] text-on-surface">check_circle</span>
            <span className="text-label-md text-on-surface truncate max-w-[180px] pr-0.5">
              {text || 'Transcript saved'}
            </span>
          </>
        )}

        {state === 'error' && (
          <>
            <span className="material-symbols-outlined filled text-[18px] text-error">warning</span>
            <span className="text-label-md text-error pr-0.5 truncate max-w-[180px]">{text || 'Error'}</span>
          </>
        )}
      </div>
    </div>
  )
}
