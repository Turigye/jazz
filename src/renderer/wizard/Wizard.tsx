import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { MODELS, DEFAULT_MODEL, modelLabel, modelDescription } from '../../shared/constants'
import { formatChord, defaultHotkeys } from '../../shared/hotkey'
import type { ModelSize, DownloadProgress, PermissionState } from '../../shared/types'

const PTT_LABEL = formatChord(defaultHotkeys(window.jazz.platform).pushToTalk, window.jazz.platform)
const IS_MAC = window.jazz.platform === 'darwin'

type Step = 'welcome' | 'pick' | 'download' | 'permissions' | 'done'
// The permissions step only exists on macOS, where mic + Accessibility are gated.
const STEPS: Step[] = IS_MAC
  ? ['welcome', 'pick', 'download', 'permissions', 'done']
  : ['welcome', 'pick', 'download', 'done']

const PICKABLE: ModelSize[] = ['small.en-q5_1', 'large-v3-turbo-q5_0', 'large-v3-turbo']

const PICK_META: Record<ModelSize, { icon: string; variant: string; accuracyBars: number }> = {
  'tiny.en':              { icon: 'speed',       variant: 'CPU', accuracyBars: 1 },
  'base.en':              { icon: 'speed',       variant: 'CPU', accuracyBars: 1 },
  'small.en':             { icon: 'speed',       variant: 'CPU', accuracyBars: 2 },
  'small.en-q5_1':        { icon: 'speed',       variant: 'CPU', accuracyBars: 2 },
  'medium.en':            { icon: 'memory',      variant: 'CPU', accuracyBars: 3 },
  'large-v3-turbo-q5_0':  { icon: 'bolt',        variant: 'CPU', accuracyBars: 3 },
  'large-v3-turbo-q8_0':  { icon: 'bolt',        variant: 'CPU', accuracyBars: 3 },
  'large-v3-turbo':       { icon: 'memory',      variant: 'GPU', accuracyBars: 4 }
}

function StepDots({ current }: { current: Step }): JSX.Element {
  const idx = STEPS.indexOf(current)
  return (
    <div className="flex gap-1">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${i === idx ? 'w-8 bg-primary' : 'w-6 bg-white/20'}`}
        />
      ))}
    </div>
  )
}

export default function Wizard(): JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [selected, setSelected] = useState<ModelSize>(DEFAULT_MODEL)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string>('')
  const [perms, setPerms] = useState<PermissionState | null>(null)

  useEffect(() => {
    return window.jazz.onDownloadProgress((p) => {
      setProgress(p)
      // On macOS, route through the permissions step before finishing.
      if (p.phase === 'complete') setStep(IS_MAC ? 'permissions' : 'done')
      if (p.phase === 'error') setError(p.error ?? 'Download failed')
    })
  }, [])

  // Poll permission status while on the permissions step so grants reflect live.
  useEffect(() => {
    if (step !== 'permissions') return
    let alive = true
    const tick = (): void => {
      void window.jazz.getPermissions().then((p) => { if (alive) setPerms(p) })
    }
    tick()
    const id = setInterval(tick, 1200)
    return () => { alive = false; clearInterval(id) }
  }, [step])

  async function beginDownload(): Promise<void> {
    setError('')
    setStep('download')
    await window.jazz.setConfig({ activeModel: selected })
    try {
      await window.jazz.startDownload(selected)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function finish(): Promise<void> {
    await window.jazz.completeFirstRun()
  }

  const stepNum = STEPS.indexOf(step) + 1

  // ─── Step bodies ────────────────────────────────────────────────────────────

  const Welcome = (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-5 shadow-glow">
        <Icon name="graphic_eq" size={36} className="text-primary" />
      </div>
      <h2 className="text-headline-lg-mobile text-on-surface tracking-tight mb-3">Meet Jazz</h2>
      <p className="text-body-md text-on-surface-variant mb-6">
        Hold <kbd className="px-1.5 py-0.5 rounded-md border border-white/10 bg-surface-container-high text-on-surface text-label-sm font-mono">{PTT_LABEL}</kbd>,
        speak naturally, and your words are typed into any app — 100% on your machine, no cloud, no API keys.
      </p>
      <p className="text-label-sm text-on-surface-variant">
        First, pick a speech model. It runs entirely offline once installed.
      </p>
    </div>
  )

  const Pick = (
    <div className="w-full grid grid-cols-3 gap-3">
      {PICKABLE.map((id) => {
        const m = MODELS[id]
        const meta = PICK_META[id]
        const active = selected === id
        const label = modelLabel(id, window.jazz.platform)
        const recommended = label.includes('★')
        const cleanLabel = label.replace(' ★ Recommended', '')
        return (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`text-left relative rounded-xl p-4 flex flex-col gap-3 backdrop-blur-glass border transition-all overflow-hidden ${
              active
                ? 'border-primary ring-1 ring-primary/50 bg-primary/5 shadow-glow'
                : 'border-white/10 bg-surface/10 hover:bg-white/5'
            }`}
          >
            {recommended && (
              <div className="absolute top-0 right-0 bg-primary text-on-primary text-label-sm px-2 py-0.5 rounded-bl-xl">
                Recommended
              </div>
            )}
            <div className="flex justify-between items-start">
              <Icon name={meta.icon} size={24} className={`${active ? 'text-primary' : 'text-on-surface-variant'}`} />
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${active ? 'border-primary bg-primary' : 'border-white/20'}`}>
                {active && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
            </div>
            <div>
              <h3 className="text-label-md text-on-surface mb-1">{cleanLabel}</h3>
              <p className="text-label-sm text-on-surface-variant font-normal leading-relaxed">{modelDescription(id, window.jazz.platform)}</p>
            </div>
            <div className="mt-auto pt-3 border-t border-white/10 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-label-sm">
                <span className="text-on-surface-variant">Size</span>
                <span className="text-on-surface">{m.sizeMb} MB</span>
              </div>
              <div className="flex justify-between items-center text-label-sm">
                <span className="text-on-surface-variant">Speed</span>
                <span className="text-on-surface">~{m.latencyMs}ms</span>
              </div>
              <div className="flex justify-between items-center text-label-sm">
                <span className="text-on-surface-variant">Accuracy</span>
                <div className="flex gap-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-3 rounded-sm ${
                        i < meta.accuracyBars
                          ? active ? 'bg-primary' : 'bg-white/70'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )

  const Download = (
    <div className="max-w-md mx-auto w-full">
      <h2 className="text-headline-md text-on-surface tracking-tight mb-2">
        Downloading {MODELS[selected].label.split(' (')[0].replace(' ★ Recommended', '')}
      </h2>
      <p className="text-label-md text-on-surface-variant mb-6">
        Once downloaded, the model lives on your device. Ready in a moment.
      </p>
      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress?.percent ?? 0}%` }} />
      </div>
      <div className="flex justify-between text-label-sm tabular-nums">
        <span className="text-on-surface-variant">
          {progress?.phase === 'verifying'
            ? 'Verifying checksum…'
            : `${((progress?.bytesDownloaded ?? 0) / 1e6).toFixed(1)} MB of ${MODELS[selected].sizeMb} MB`}
        </span>
        <span className="text-on-surface">{progress?.percent ?? 0}%</span>
      </div>
      {error && (
        <div className="mt-6 rounded-lg border border-error/30 bg-error-container/20 p-3 text-error text-label-md">
          {error}
        </div>
      )}
    </div>
  )

  const micGranted = perms?.microphone === 'granted'
  const axGranted = perms?.accessibility === true

  function PermRow({
    icon, title, desc, granted, actionLabel, onAction
  }: { icon: string; title: string; desc: string; granted: boolean; actionLabel: string; onAction: () => void }): JSX.Element {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-surface/10 p-4">
        <Icon name={icon} size={24} className={`${granted ? 'text-primary' : 'text-on-surface-variant'}`} />
        <div className="min-w-0 flex-1">
          <h3 className="text-label-md text-on-surface">{title}</h3>
          <p className="text-label-sm text-on-surface-variant leading-relaxed">{desc}</p>
        </div>
        {granted ? (
          <span className="inline-flex items-center gap-1 text-primary text-label-sm shrink-0">
            <Icon name="check_circle" size={16} />Granted
          </span>
        ) : (
          <button onClick={onAction} className="btn-primary shrink-0">{actionLabel}</button>
        )}
      </div>
    )
  }

  const Permissions = (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-3">
      <p className="text-label-md text-on-surface-variant text-center mb-1">
        macOS asks your permission before any app can hear you or type for you. Grant these once and Jazz is set.
      </p>
      <PermRow
        icon="mic"
        title="Microphone"
        desc="So Jazz can hear your dictation. Audio is processed on-device and never leaves your Mac."
        granted={micGranted}
        actionLabel="Allow"
        onAction={() => void window.jazz.requestMicrophone().then(() => window.jazz.getPermissions().then(setPerms))}
      />
      <PermRow
        icon="accessibility_new"
        title="Accessibility"
        desc={`So the ${PTT_LABEL} hotkey works and Jazz can paste text into the focused app. Required by macOS for every dictation app.`}
        granted={axGranted}
        actionLabel="Open Settings"
        onAction={() => window.jazz.promptAccessibility()}
      />
      {!axGranted && (
        <p className="text-label-sm text-on-surface-variant text-center mt-1">
          After flipping <span className="text-on-surface">Jazz</span> on in Settings, this updates automatically.
        </p>
      )}
    </div>
  )

  const Done = (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mb-5 shadow-glow">
        <Icon name="check_circle" size={36} className="text-primary" />
      </div>
      <h2 className="text-headline-md text-on-surface tracking-tight mb-3">You're ready</h2>
      <p className="text-body-md text-on-surface-variant">
        Jazz lives in your {window.jazz.platform === 'darwin' ? 'menu bar' : 'system tray'}. Hold{' '}
        <kbd className="px-1.5 py-0.5 rounded-md border border-white/10 bg-surface-container-high text-on-surface text-label-sm font-mono">{PTT_LABEL}</kbd>{' '}
        anywhere and start speaking.
      </p>
    </div>
  )

  // ─── Shell ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-screen h-screen flex items-center justify-center p-3 ambient-glow">
      <div className="w-full h-full glass-strong rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b border-white/10 flex flex-col gap-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-widest">
              Step {stepNum} of {STEPS.length}
            </span>
            <StepDots current={step} />
          </div>
          {step === 'pick' && (
            <>
              <h1 className="text-headline-md text-on-surface tracking-tight mt-1">Select your model</h1>
              <p className="text-label-md text-on-surface-variant">
                Pick the model that matches your hardware. You can change this later.
              </p>
            </>
          )}
          {step === 'permissions' && (
            <h1 className="text-headline-md text-on-surface tracking-tight mt-1">Grant permissions</h1>
          )}
        </header>

        {/* Body */}
        <section className="flex-1 p-6 flex items-center justify-center overflow-y-auto">
          {step === 'welcome' && Welcome}
          {step === 'pick' && Pick}
          {step === 'download' && Download}
          {step === 'permissions' && Permissions}
          {step === 'done' && Done}
        </section>

        {/* Footer */}
        <footer className="px-6 py-3 border-t border-white/10 bg-surface-container-lowest/50 shrink-0 flex items-center justify-between">
          <div className="text-label-sm text-on-surface-variant">
            {step === 'welcome' && 'Welcome to Jazz'}
            {step === 'pick' && `Selected: ${MODELS[selected].label.split(' (')[0].replace(' ★ Recommended', '')}`}
            {step === 'download' && 'Downloading from Hugging Face'}
            {step === 'permissions' && (micGranted && axGranted ? 'All set' : 'Grant to enable dictation')}
            {step === 'done' && 'Setup complete'}
          </div>
          <div className="flex gap-2">
            {step === 'welcome' && (
              <button onClick={() => setStep('pick')} className="btn-primary">
                Get started
                <Icon name="arrow_forward" size={18} />
              </button>
            )}
            {step === 'pick' && (
              <>
                <button onClick={() => setStep('welcome')} className="btn-ghost">
                  <Icon name="arrow_back" size={18} />
                  Back
                </button>
                <button onClick={beginDownload} className="btn-primary">
                  Download
                  <Icon name="arrow_forward" size={18} />
                </button>
              </>
            )}
            {step === 'download' && error && (
              <button onClick={beginDownload} className="btn-primary">
                Retry
                <Icon name="refresh" size={18} />
              </button>
            )}
            {step === 'permissions' && (
              <button onClick={() => setStep('done')} className="btn-primary">
                {micGranted && axGranted ? 'Continue' : 'Skip for now'}
                <Icon name="arrow_forward" size={18} />
              </button>
            )}
            {step === 'done' && (
              <button onClick={finish} className="btn-primary">
                Start using Jazz
                <Icon name="arrow_forward" size={18} />
              </button>
            )}
          </div>
        </footer>
      </div>

      <style>{`
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: #c9a227;
          color: #1a1408;
          padding: 0.5rem 1.25rem;
          border-radius: 3px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          box-shadow: 0 0 15px rgba(201,162,39,0.25);
          transition: opacity 150ms;
        }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          color: #ede6da;
          padding: 0.5rem 1.25rem;
          border-radius: 3px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.01em;
          border: 1px solid rgba(255,220,180,0.14);
          transition: border-color 150ms;
        }
        .btn-ghost:hover { border-color: rgba(201,162,39,0.5); }
      `}</style>
    </div>
  )
}
