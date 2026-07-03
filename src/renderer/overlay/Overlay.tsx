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
  'large-v3-turbo': 'turbo'
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
  const [state, setState] = useState<JazzState>('idle')
  const [text, setText] = useState<string>('')
  const [config, setConfig] = useState<JazzConfig | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)
  const recordStart = useRef<number>(0)

  // Drag tracking
  const dragging = useRef(false)
  const moved = useRef(0)
  const lastPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const pillRef = useRef<HTMLDivElement>(null)
  const interactive = useRef(false)

  useEffect(() => {
    void window.jazz.getConfig().then(setConfig)
  }, [])

  // The overlay window is click-through by default; only the pill should capture
  // the mouse. The window forwards mousemove even while ignoring clicks, so we
  // watch the cursor and flip interactivity on when it's over the pill and off
  // when it leaves — letting clicks pass to the app underneath everywhere else.
  useEffect(() => {
    function onMove(e: MouseEvent): void {
      // While dragging, interactivity stays pinned ON so the pill keeps
      // receiving the pointerup that ends the drag — never toggle mid-drag.
      if (dragging.current) return
      const el = pillRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const inside =
        e.clientX >= r.left - 2 && e.clientX <= r.right + 2 &&
        e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2
      setInteractive(inside)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  function setInteractive(on: boolean): void {
    if (on === interactive.current) return
    interactive.current = on
    window.jazz.setOverlayInteractive(on)
  }

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

  function onPointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return // left button only
    dragging.current = true
    moved.current = 0
    lastPt.current = { x: e.screenX, y: e.screenY }
    interactive.current = true // pinned during the drag
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    // Main follows the OS cursor natively from here — no per-move IPC.
    window.jazz.startOverlayDrag()
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!dragging.current) return
    // Only accumulate distance to tell a click from a drag; the window itself
    // is moved by the main process, so we send nothing here.
    moved.current += Math.abs(e.screenX - lastPt.current.x) + Math.abs(e.screenY - lastPt.current.y)
    lastPt.current = { x: e.screenX, y: e.screenY }
  }

  function endDrag(e: React.PointerEvent): void {
    if (!dragging.current) return
    dragging.current = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    window.jazz.endOverlayDrag()
    if (moved.current < OVERLAY.DRAG_THRESHOLD) {
      window.jazz.toggleListening()
    }
    // Re-evaluate click-through against where the cursor actually ended up.
    const el = pillRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const inside =
        e.clientX >= r.left - 2 && e.clientX <= r.right + 2 &&
        e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2
      setInteractive(inside)
    }
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

  return (
    <div className="w-full h-full flex items-center justify-center select-none overflow-hidden">
      <div
        ref={pillRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Click to toggle listening · drag to move"
        className={`animate-fade-in inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-glass border cursor-pointer max-w-full ${borderClass} ${shadowClass} ${bgClass}`}
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
            <span className="text-label-md text-primary font-medium tabular-nums whitespace-nowrap">
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
