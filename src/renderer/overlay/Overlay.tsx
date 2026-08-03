import { useEffect, useRef, useState } from 'react'
import type { JazzState, JazzConfig, ModelSize } from '../../shared/types'
import { OVERLAY } from '../../shared/constants'
import VuMeter from './VuMeter'

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

/** Machined housing the modules sit in — dark panel, lit top edge, brass rim. */
const HOUSING =
  'inline-flex items-center rounded-lg border shadow-plate backdrop-blur-glass ' +
  'cursor-pointer max-w-full animate-fade-in select-none'

export default function Overlay(): JSX.Element {
  const [state, setState] = useState<JazzState>('idle')
  const [text, setText] = useState<string>('')
  const [config, setConfig] = useState<JazzConfig | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)
  const recordStart = useRef<number>(0)

  // Live input level. Held in a ref and read by the meter's frame loop — this
  // arrives ~12×/second while recording and must not drive React renders.
  const level = useRef(0)
  const stateRef = useRef<JazzState>('idle')
  stateRef.current = state

  // Drag tracking
  const dragging = useRef(false)
  const moved = useRef(0)
  const lastPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const pillRef = useRef<HTMLDivElement>(null)
  const interactive = useRef(false)

  useEffect(() => {
    void window.jazz.getConfig().then(setConfig)
  }, [])

  useEffect(() => {
    return window.jazz.onLevel((rms) => { level.current = rms })
  }, [])

  // The overlay window is click-through by default; only the module should
  // capture the mouse. The window forwards mousemove even while ignoring
  // clicks, so we watch the cursor and flip interactivity on when it's over
  // the module and off when it leaves — letting clicks pass to the app
  // underneath everywhere else.
  useEffect(() => {
    function onMove(e: MouseEvent): void {
      // While dragging, interactivity stays pinned ON so the module keeps
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
  const metered = state === 'recording'

  // Housing tone follows state. Only failure changes the rim colour — the
  // meter itself carries every other signal, so nothing else needs to shout.
  const housingStyle: React.CSSProperties =
    state === 'error'
      ? { background: 'linear-gradient(180deg, #3a221c 0%, #2a1713 100%)', borderColor: '#6e2418' }
      : { background: 'linear-gradient(180deg, #302b26 0%, #211d19 100%)', borderColor: '#5c4c2e' }

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <div
        ref={pillRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Click to toggle listening · drag to move"
        style={housingStyle}
        className={`${HOUSING} ${metered ? 'gap-3 p-1.5 pr-3' : 'gap-2.5 px-3 py-2'}`}
      >
        {state === 'idle' && (
          <>
            <span className="w-[7px] h-[7px] rounded-full bg-brass-dim shrink-0" />
            <span className="font-mono text-[10.5px] tracking-wider text-cream-dim">{modelBadge}</span>
          </>
        )}

        {metered && (
          <>
            <VuMeter getLevel={() => level.current} getActive={() => stateRef.current === 'recording'} />
            <span className="font-mono text-[13px] tabular-nums text-brass-bright tracking-wide whitespace-nowrap">
              {fmtElapsed(elapsed)}
            </span>
          </>
        )}

        {state === 'transcribing' && (
          <>
            <span className="w-[7px] h-[7px] rounded-full bg-brass animate-lamp shrink-0 shadow-[0_0_7px_1px_rgba(201,162,39,0.6)]" />
            <span className="font-mono text-[10.5px] tracking-wider text-cream-dim">transcribing</span>
          </>
        )}

        {state === 'injecting' && (
          <>
            <span className="w-[7px] h-[7px] rounded-full bg-brass shrink-0" />
            <span className="text-[12px] text-cream truncate max-w-[210px]">{text || 'inserting…'}</span>
          </>
        )}

        {state === 'success' && (
          <>
            <span className="w-[7px] h-[7px] rounded-full bg-brass-bright shrink-0 shadow-[0_0_7px_1px_rgba(229,193,88,0.5)]" />
            <span className="text-[12px] text-cream truncate max-w-[210px]">{text || 'saved'}</span>
          </>
        )}

        {state === 'error' && (
          <>
            <span className="w-[7px] h-[7px] rounded-full bg-oxide shrink-0 shadow-[0_0_7px_1px_rgba(196,68,47,0.55)]" />
            <span className="text-[12px] text-on-error-container truncate max-w-[210px]">{text || 'error'}</span>
          </>
        )}
      </div>
    </div>
  )
}
