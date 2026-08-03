import { useEffect, useRef } from 'react'
import { VU } from '../../shared/constants'

// ── The signature element ────────────────────────────────────────────────────
// An analog VU meter driven by the real microphone signal.
//
// Two details do the work here, and both are cheap:
//
//   1. Deflection is linear in *amplitude*, not decibels. That's how the
//      instrument actually behaves, and it's why the numbers on a real VU face
//      bunch up at the quiet end — the scale is painted logarithmically over a
//      linear movement. Mapping dB straight to angle would look subtly wrong
//      in a way that's hard to name but easy to feel.
//
//   2. The needle is a damped spring, not an eased tween. It overshoots a few
//      percent on a transient and settles back, because it has mass.
//
// The animation runs on a rAF loop writing directly to the SVG transform.
// React never re-renders during recording — at 60fps through the reconciler
// this would burn CPU for no reason, on an element that's on screen all day.

/** Amplitude ratio (1.0 = 0 VU) for a given point on the dB scale. */
function dbToAmp(db: number): number {
  return Math.pow(10, db / 20)
}

const AMP_MIN = dbToAmp(VU.MIN_DB)
const AMP_MAX = dbToAmp(VU.MAX_DB)

/** Map an amplitude ratio onto 0..1 across the painted scale. */
function ampToFraction(amp: number): number {
  const f = (amp - AMP_MIN) / (AMP_MAX - AMP_MIN)
  return f < 0 ? 0 : f > 1 ? 1 : f
}

/** Needle angle in degrees from vertical, for an amplitude ratio. */
function ampToAngle(amp: number): number {
  return -VU.MAX_ANGLE + ampToFraction(amp) * (VU.MAX_ANGLE * 2)
}

// Face geometry. The pivot sits just below the visible face and the movement
// is clipped to the face window, so what you see is the needle travelling
// behind glass — the same reason a real meter hides its hub behind the bezel.
// The arc radius is chosen so the scale spans nearly the full face width;
// a smaller radius bunches the numbers into the middle and reads as a dial,
// not a VU.
const FACE_W = 140
const FACE_H = 64
const PIVOT_X = FACE_W / 2
// Just far enough below the face that the brass hub crests the bottom edge as
// a shallow dome, the way the movement's cap sits behind a real bezel.
const PIVOT_Y = 68
const NEEDLE_LEN = 60
const TICK_OUTER = 56
const LABEL_R = 63

/** Ticks painted on the face. Longer marks carry a number. */
const TICKS: { db: number; label?: string; major: boolean }[] = [
  { db: -20, label: '-20', major: true },
  { db: -15, major: false },
  { db: -10, label: '-10', major: true },
  { db: -7,  label: '-7',  major: true },
  { db: -5,  label: '-5',  major: true },
  { db: -3,  label: '-3',  major: true },
  { db: -2,  major: false },
  { db: -1,  label: '-1',  major: true },
  { db: 0,   label: '0',   major: true },
  { db: 1,   label: '+1',  major: true },
  { db: 2,   label: '+2',  major: true },
  { db: 3,   label: '+3',  major: true }
]

/** Point at radius r along the needle's arc, at the angle for `db`. */
function polar(db: number, r: number): { x: number; y: number } {
  const a = (ampToAngle(dbToAmp(db)) * Math.PI) / 180
  return {
    x: PIVOT_X + Math.sin(a) * r,
    y: PIVOT_Y - Math.cos(a) * r
  }
}

/** SVG arc path between two points on the scale, at radius r. */
function arcPath(fromDb: number, toDb: number, r: number): string {
  const a = polar(fromDb, r)
  const b = polar(toDb, r)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

export default function VuMeter({
  getLevel, getActive
}: {
  /** Latest input RMS, 0..1. Read inside the frame loop, never as a prop, so
   *  levels arriving over IPC don't re-render React ~12×/second. */
  getLevel: () => number
  /** Whether we're capturing. When false the needle falls back to rest. */
  getActive: () => boolean
}): JSX.Element {
  const needleRef = useRef<SVGGElement>(null)
  const peakRef = useRef<SVGPathElement>(null)

  // Live state for the integrator, in refs so nothing here touches the
  // reconciler while the meter is running.
  const pos = useRef(0)
  const vel = useRef(0)
  const peakUntil = useRef(0)

  // Keep the latest accessors reachable from the long-lived frame loop
  // without re-subscribing it on every render.
  const levelFn = useRef(getLevel)
  const activeFn = useRef(getActive)
  levelFn.current = getLevel
  activeFn.current = getActive

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const zeroAngle = ampToAngle(0)

    const frame = (now: number): void => {
      // Clamp dt so a stalled frame (window occluded, machine asleep) can't
      // blow up the integrator.
      const dt = Math.min((now - last) / 1000, 0.033)
      last = now

      const target = activeFn.current() ? levelFn.current() / VU.REF_RMS : 0

      // Semi-implicit Euler on a damped spring — stable at these constants,
      // and it preserves the overshoot that makes the needle feel physical.
      const accel =
        VU.OMEGA * VU.OMEGA * (target - pos.current) -
        2 * VU.ZETA * VU.OMEGA * vel.current
      vel.current += accel * dt
      pos.current += vel.current * dt
      if (pos.current < 0) { pos.current = 0; vel.current = 0 }

      const angle = ampToAngle(pos.current)
      needleRef.current?.setAttribute(
        'transform',
        `rotate(${angle.toFixed(2)} ${PIVOT_X} ${PIVOT_Y})`
      )

      // Overload lamp: latch on any excursion past 0 VU, hold briefly so a
      // transient doesn't flash by unseen.
      if (pos.current >= 1) peakUntil.current = now + VU.PEAK_HOLD_MS
      const lit = now < peakUntil.current
      peakRef.current?.setAttribute('opacity', lit ? '1' : '0.28')

      raf = requestAnimationFrame(frame)
    }

    // Park the needle at rest before the first frame so it doesn't snap.
    needleRef.current?.setAttribute(
      'transform', `rotate(${zeroAngle.toFixed(2)} ${PIVOT_X} ${PIVOT_Y})`
    )
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      width={FACE_W}
      height={FACE_H}
      viewBox={`0 0 ${FACE_W} ${FACE_H}`}
      role="img"
      aria-label="Microphone input level"
      className="block"
    >
      <defs>
        {/* The tungsten lamp behind the face — brightest at the bottom
            centre, where the bulb actually sits in a real meter. */}
        <radialGradient id="vu-lamp" cx="50%" cy="96%" r="86%">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.50" />
          <stop offset="55%" stopColor="#ffd9a0" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vu-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe2c2" />
          <stop offset="62%" stopColor="#e8d9b6" />
          <stop offset="100%" stopColor="#d2c199" />
        </linearGradient>
        {/* The movement lives behind the face window. */}
        <clipPath id="vu-window">
          <rect x="0" y="0" width={FACE_W} height={FACE_H} rx="3" />
        </clipPath>
      </defs>

      {/* Face */}
      <rect x="0" y="0" width={FACE_W} height={FACE_H} rx="3" fill="url(#vu-face)" />
      <rect x="0" y="0" width={FACE_W} height={FACE_H} rx="3" fill="url(#vu-lamp)" />

      {/* Scale baseline, and the red overload arc past 0 VU */}
      <path d={arcPath(VU.MIN_DB, 0, TICK_OUTER)} fill="none" stroke="#3a3225" strokeWidth="1" />
      <path
        ref={peakRef}
        d={arcPath(0, VU.MAX_DB, TICK_OUTER)}
        fill="none" stroke="#c4442f" strokeWidth="1.8" opacity="0.28"
      />

      {/* Ticks */}
      {TICKS.map(({ db, major }) => {
        const outer = polar(db, TICK_OUTER)
        const inner = polar(db, TICK_OUTER - (major ? 6 : 3.5))
        const over = db > 0
        return (
          <line
            key={db}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke={over ? '#c4442f' : '#3a3225'}
            strokeWidth={major ? 1.2 : 0.8}
            opacity={major ? 1 : 0.6}
          />
        )
      })}

      {/* Numbers */}
      {TICKS.filter((t) => t.label).map(({ db, label }) => {
        const p = polar(db, LABEL_R)
        return (
          <text
            key={`l${db}`}
            x={p.x} y={p.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="6"
            fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
            fill={db > 0 ? '#a5341f' : '#463b28'}
          >
            {label}
          </text>
        )
      })}

      <text
        x={PIVOT_X} y={FACE_H - 6}
        textAnchor="middle"
        fontSize="6" letterSpacing="1.8"
        fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
        fill="#6b5c42" opacity="0.55"
      >
        VU
      </text>

      {/* The movement, clipped to the face window. Rotated imperatively by
          the rAF loop above — React never touches this during recording. */}
      <g clipPath="url(#vu-window)">
        <g ref={needleRef}>
          <line
            x1={PIVOT_X} y1={PIVOT_Y}
            x2={PIVOT_X} y2={PIVOT_Y - NEEDLE_LEN}
            stroke="#2b2213" strokeWidth="1.4" strokeLinecap="round"
          />
        </g>
        <circle cx={PIVOT_X} cy={PIVOT_Y} r="7" fill="#c9a227" />
        <circle cx={PIVOT_X} cy={PIVOT_Y} r="3" fill="#2a2214" />
      </g>
    </svg>
  )
}
