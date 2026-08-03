import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { useConfig } from './useConfig'
import { MODELS, APP_VERSION, modelLabel } from '../../shared/constants'
import { keyLabel, formatChord, defaultHotkeys } from '../../shared/hotkey'
import type {
  ModelSize, ModelStatus, DownloadProgress,
  DictionaryEntry, SnippetEntry, TranscriptRecord
} from '../../shared/types'

const PLATFORM = window.jazz.platform
const IS_MAC = PLATFORM === 'darwin'
const HOTKEYS = defaultHotkeys(PLATFORM)

type Tab = 'general' | 'model' | 'hotkeys' | 'dictionary' | 'snippets' | 'transcripts' | 'about'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'transcripts',label: 'Transcripts',   icon: 'history' },
  { id: 'general',    label: 'General',       icon: 'settings' },
  { id: 'model',      label: 'Model',         icon: 'mic' },
  { id: 'hotkeys',    label: 'Hotkeys',       icon: 'keyboard' },
  { id: 'dictionary', label: 'Dictionary',    icon: 'book_2' },
  { id: 'snippets',   label: 'Snippets',      icon: 'bolt' },
  { id: 'about',      label: 'About',         icon: 'info' }
]

const LANGUAGES: [string, string][] = [
  ['auto', 'Auto-detect'], ['en', 'English'], ['fr', 'French'], ['es', 'Spanish'],
  ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch']
]

// ─── Primitives ───────────────────────────────────────────────────────────────

// A panel switch: brass when live, dark when not. Squared off, because
// nothing on a console front panel is a pill.
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-[38px] h-[21px] shrink-0 rounded-sm border transition-colors duration-150 ${
        checked
          ? 'bg-brass border-brass-edge shadow-[0_0_10px_rgba(201,162,39,0.22)]'
          : 'bg-surface-container-lowest border-outline-variant'
      }`}
    >
      <span
        className={`absolute top-[2px] w-[15px] h-[15px] rounded-[2px] transition-transform duration-150 ${
          checked ? 'translate-x-[20px] bg-[#1a1408]' : 'translate-x-[2px] bg-cream-faint'
        }`}
      />
    </button>
  )
}

// Settings read as a continuous list of engraved rows separated by hairlines,
// rather than a stack of floating cards. The secondary line is set in the
// same plate lettering as the nav, which is what ties the two together.
function Row({
  title, hint, control
}: { title: string; hint?: string; control: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 px-1 border-b border-outline-variant/60 hover:bg-brass/[0.035] transition-colors">
      <div className="min-w-0">
        <div className="text-body-md text-cream">{title}</div>
        {hint && <div className="text-plate uppercase text-cream-faint mt-1">{hint}</div>}
      </div>
      {control}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h3 className="text-plate uppercase text-brass-dim mb-2 mt-7 w-condensed">
      {children}
    </h3>
  )
}

function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-end justify-between border-b border-brass/25 pb-4 mb-7">
      <div>
        <h2 className="text-headline-md text-cream w-expanded">{title}</h2>
        {subtitle && <p className="text-label-md text-cream-dim mt-1.5 max-w-[62ch]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function KbdChip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex items-center px-2 py-0.5 rounded-[3px] border border-brass/35 bg-brass/10 text-brass-bright text-label-sm font-mono">
      {children}
    </kbd>
  )
}

function ChordDisplay({ chord }: { chord: string }): JSX.Element {
  const parts = chord.split('+').filter(Boolean)
  return (
    <div className="flex items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <KbdChip>{keyLabel(p, PLATFORM)}</KbdChip>
          {i < parts.length - 1 && !IS_MAC && <span className="text-on-surface-variant text-label-sm">+</span>}
        </span>
      ))}
    </div>
  )
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab(): JSX.Element {
  const { config, update } = useConfig()
  if (!config) return <></>
  return (
    <div>
      <PageHeader title="General" />
      <SectionHeader>Startup</SectionHeader>
      <div className="mb-8 border-t border-outline-variant/60">
        <Row title="Open Jazz when you log in" hint="Runs in the menu bar, ready for the hotkey"
          control={<Toggle checked={config.launchAtStartup} onChange={(v) => update({ launchAtStartup: v })} />} />
        <Row title="Show the meter" hint="Click it to start and stop · drag to move it"
          control={<Toggle checked={config.showOverlay} onChange={(v) => update({ showOverlay: v })} />} />
        <Row title="Play a sound when recording starts and stops" hint="A short cue, useful when the meter is hidden"
          control={<Toggle checked={config.playSounds} onChange={(v) => update({ playSounds: v })} />} />
      </div>

      <SectionHeader>Processing</SectionHeader>
      <div className="mb-8 border-t border-outline-variant/60">
        <Row title="Transcribe on the graphics card"
          hint={IS_MAC
            ? 'Much faster than the CPU · turn off if you hit trouble'
            : 'Up to 20× faster on an NVIDIA card · turn off to force CPU'}
          control={<Toggle checked={config.useGPU} onChange={(v) => update({ useGPU: v })} />} />
        <Row title="Trim silence before transcribing" hint="Skips pauses and breathing · recommended"
          control={<Toggle checked={config.useVAD} onChange={(v) => update({ useVAD: v })} />} />
        <Row title="Search harder for the right words" hint="More accurate, slightly slower"
          control={<Toggle checked={config.beamSearch} onChange={(v) => update({ beamSearch: v })} />} />
      </div>

      <SectionHeader>The text you get</SectionHeader>
      <div className="mb-8 border-t border-outline-variant/60">
        <Row title="Drop filler words" hint="Removes um · uh · like · basically"
          control={<Toggle checked={config.removeFiller} onChange={(v) => update({ removeFiller: v })} />} />
        <Row title="Mute other audio while listening" hint="Silences playback so the mic hears you, then restores it"
          control={<Toggle checked={config.muteWhileListening} onChange={(v) => update({ muteWhileListening: v })} />} />
      </div>

      <SectionHeader>Language</SectionHeader>
      <Row title="Language you speak" hint="Auto-detect handles most cases"
        control={
          <div className="relative">
            <select
              value={config.language}
              onChange={(e) => update({ language: e.target.value })}
              className="appearance-none bg-black/40 border border-white/10 text-on-surface text-body-md rounded-lg py-1.5 pl-3 pr-9 focus:outline-none focus:border-white/40 cursor-pointer"
            >
              {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <Icon name="expand_more" size={20} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          </div>
        } />
    </div>
  )
}

// ─── Tab: Model (slim row layout) ─────────────────────────────────────────────

function ModelTab(): JSX.Element {
  const { config, update } = useConfig()
  const [status, setStatus] = useState<ModelStatus[]>([])
  // One progress entry per concurrent download, keyed by modelId, so parallel
  // downloads no longer overwrite each other's bar.
  const [downloads, setDownloads] = useState<Map<ModelSize, DownloadProgress>>(new Map())
  const [mics, setMics] = useState<{ id: number; name: string }[] | null>(null)

  const refresh = (): void => { void window.jazz.getModelsStatus().then(setStatus) }
  useEffect(() => {
    refresh()
    return window.jazz.onDownloadProgress((p) => {
      setDownloads((m) => {
        const next = new Map(m)
        if (p.phase === 'complete' || p.phase === 'error') next.delete(p.modelId)
        else next.set(p.modelId, p)
        return next
      })
      if (p.phase === 'complete') refresh()
    })
  }, [])

  function startDownload(id: ModelSize): void {
    // Optimistic placeholder so the bar appears instantly, before the first
    // progress event lands.
    setDownloads((m) => {
      if (m.has(id)) return m
      const next = new Map(m)
      next.set(id, { modelId: id, bytesDownloaded: 0, totalBytes: MODELS[id].sizeMb * 1024 * 1024, percent: 0, phase: 'downloading' })
      return next
    })
    void window.jazz.startDownload(id)
  }

  if (!config) return <></>
  const installed = (id: ModelSize): boolean => status.find((s) => s.id === id)?.installed ?? false

  return (
    <div>
      <PageHeader
        title="Model"
        subtitle="Larger models trade speed for accuracy."
        action={
          <button
            onClick={() => void window.jazz.getMicDevices().then(setMics)}
            className="inline-flex items-center gap-2 bg-transparent border border-white/10 text-on-surface text-label-md py-1.5 px-3 rounded-lg hover:border-white/30 transition-colors h-fit"
          >
            <Icon name="mic" size={18} />
            <span>Test mic</span>
          </button>
        }
      />

      <ul className="flex flex-col gap-1.5">
        {(Object.keys(MODELS) as ModelSize[]).map((id) => {
          const m = MODELS[id]
          const active = config.activeModel === id
          const have = installed(id)
          const label = modelLabel(id, PLATFORM)
          const recommended = label.includes('★')
          const cleanLabel = label.replace(' ★ Recommended', '')
          return (
            <li
              key={id}
              className={`glass rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
                active ? 'border-primary/40 bg-primary/[0.06] shadow-glow' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-body-md text-on-surface truncate">{cleanLabel}</span>
                  {recommended && !active && (
                    <span className="text-label-sm text-primary/90 font-medium">Recommended</span>
                  )}
                </div>
                <div className="text-label-sm text-on-surface-variant tabular-nums">
                  {m.sizeMb} MB · ~{m.latencyMs}ms · {m.wer}% WER
                </div>
              </div>
              {have ? (
                active ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/15 border border-primary/30 text-primary text-label-sm uppercase tracking-wider">
                    Active
                  </span>
                ) : (
                  <button
                    onClick={() => update({ activeModel: id })}
                    className="inline-flex items-center px-3 py-1.5 rounded-md border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors"
                  >
                    Use
                  </button>
                )
              ) : downloads.has(id) ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 bg-primary/10 text-primary text-label-md tabular-nums">
                  <Icon name="cloud_download" size={16} className="animate-pulse" />
                  {downloads.get(id)?.percent ?? 0}%
                </span>
              ) : (
                <button
                  onClick={() => startDownload(id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors"
                >
                  <Icon name="download" size={16} />
                  Download
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {downloads.size > 0 && (
        <div className="flex flex-col gap-2 mt-5">
          {Array.from(downloads.entries()).map(([id, p]) => (
            <div key={id} className="glass-strong rounded-xl p-4 flex items-center gap-4">
              <Icon name="cloud_download" size={18} className="text-primary" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline text-label-md mb-1">
                  <span className="text-on-surface truncate">
                    {p.phase === 'verifying'
                      ? `Verifying ${MODELS[id].label.split(' (')[0]}…`
                      : `Downloading ${MODELS[id].label.split(' (')[0]}`}
                  </span>
                  <span className="text-on-surface-variant tabular-nums">{p.percent}%</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${p.percent}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mics && (
        <div className="glass rounded-xl p-4 mt-5">
          {mics.length === 0
            ? <p className="text-error text-label-md">No microphones detected.</p>
            : (
              <ul className="space-y-1 text-label-md">
                {mics.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-on-surface">
                    <Icon name="mic" size={18} className="text-on-surface-variant" />
                    {d.name}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Hotkeys (configurable) ──────────────────────────────────────────────

function HotkeyRebind({
  label, current, onSave, defaultChord, accessibilityGranted
}: { label: string; current: string; onSave: (chord: string) => void; defaultChord: string; accessibilityGranted: boolean }): JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  async function startCapture(): Promise<void> {
    setError('')
    setCapturing(true)
    try {
      const chord = await window.jazz.captureHotkey()
      onSave(chord)
    } catch (e) {
      const msg = (e as Error).message
      if (msg === 'cancelled') {
        // no-op
      } else if (msg.includes('timeout') && !accessibilityGranted) {
        // The capture listens via the same OS-level key tap the global
        // hotkey uses — without Accessibility granted it never receives any
        // keys, so it always times out. The raw IPC error is meaningless
        // here; point at the actual cause instead.
        setError('Jazz needs Accessibility access to detect key presses')
      } else {
        setError(msg)
      }
    } finally {
      setCapturing(false)
    }
  }

  function cancel(): void {
    window.jazz.cancelCaptureHotkey()
    setCapturing(false)
  }

  return (
    <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-body-md text-on-surface mb-1">{label}</div>
        {capturing ? (
          <div className="text-label-sm text-primary">Press a key combination… (Esc to cancel)</div>
        ) : error ? (
          <div className="text-label-sm text-error">{error}. Try again.</div>
        ) : (
          <ChordDisplay chord={current} />
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {capturing ? (
          <button onClick={cancel} className="px-3 py-1.5 rounded-md border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors">
            Cancel
          </button>
        ) : (
          <>
            {current !== defaultChord && (
              <button
                onClick={() => onSave(defaultChord)}
                className="px-3 py-1.5 rounded-md text-on-surface-variant text-label-md hover:text-on-surface transition-colors"
              >
                Reset
              </button>
            )}
            <button
              onClick={startCapture}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors"
            >
              <Icon name="edit" size={16} />
              Rebind
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function HotkeysTab(): JSX.Element {
  const { config, update } = useConfig()
  const [accessibilityGranted, setAccessibilityGranted] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function check(): Promise<void> {
      const perms = await window.jazz.getPermissions()
      if (!cancelled) setAccessibilityGranted(!perms.applicable || perms.accessibility)
    }
    void check()
    // Re-check on focus: the user very likely just came back from granting
    // it in System Settings.
    window.addEventListener('focus', check)
    return () => { cancelled = true; window.removeEventListener('focus', check) }
  }, [])

  if (!config) return <></>
  return (
    <div>
      <PageHeader title="Hotkeys" subtitle={`Keyboard shortcuts for hands-free dictation. Modifier-only combos (${IS_MAC ? '⌃⇧⌥⌘' : 'Ctrl/Shift/Alt/Win'}) work best.`} />
      {!accessibilityGranted && (
        <div className="mb-4 p-3 rounded-lg border border-error/30 bg-error/10 flex items-center justify-between gap-3">
          <div className="text-label-sm text-on-surface">
            Accessibility access isn't granted, so global hotkeys and rebinding are both disabled right now.
            If Jazz is already listed as enabled in Settings, toggle it off and back on — a rebuild can leave that grant stale.
          </div>
          <button
            onClick={() => window.jazz.openAccessibilitySettings()}
            className="shrink-0 px-3 py-1.5 rounded-md border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors"
          >
            Open Settings
          </button>
        </div>
      )}
      <div className="space-y-2">
        <HotkeyRebind
          label="Push to talk · hold to record, release to transcribe"
          current={config.pushToTalkHotkey}
          defaultChord={HOTKEYS.pushToTalk}
          onSave={(chord) => void update({ pushToTalkHotkey: chord })}
          accessibilityGranted={accessibilityGranted}
        />
        <HotkeyRebind
          label="Toggle listening · tap once to start, tap again to stop"
          current={config.commandModeHotkey}
          defaultChord={HOTKEYS.toggle}
          onSave={(chord) => void update({ commandModeHotkey: chord })}
          accessibilityGranted={accessibilityGranted}
        />
      </div>
      <p className="mt-6 text-label-sm text-on-surface-variant">
        Tip: pure-modifier combos (e.g. {formatChord(HOTKEYS.pushToTalk, PLATFORM)}) never type stray characters into the focused app.
        Function keys (F1–F12) and Space work too.
      </p>
    </div>
  )
}

// ─── Tab: Dictionary ──────────────────────────────────────────────────────────

function DictionaryTab(): JSX.Element {
  const { config, update } = useConfig()
  const [spoken, setSpoken] = useState('')
  const [typed, setTyped] = useState('')
  if (!config) return <></>
  const entries = config.dictionary ?? []

  const add = (): void => {
    if (!spoken.trim() || !typed.trim()) return
    const next: DictionaryEntry = { id: crypto.randomUUID(), spoken: spoken.trim(), typed: typed.trim() }
    void update({ dictionary: [...entries, next] })
    setSpoken(''); setTyped('')
  }
  const remove = (id: string): void => void update({ dictionary: entries.filter((e) => e.id !== id) })

  return (
    <div>
      <PageHeader title="Dictionary" subtitle="Bias recognition toward your vocabulary, then enforce exact spellings on the way out." />

      <SectionHeader>Vocabulary boost</SectionHeader>
      <p className="text-label-sm text-on-surface-variant mb-3">
        Names, jargon, and terms you use often. Jazz feeds these to whisper as a prompt — the best way to fix words it keeps mishearing.
      </p>
      <textarea
        defaultValue={config.vocabulary}
        onBlur={(e) => void update({ vocabulary: e.target.value })}
        placeholder="e.g. Kubernetes, Anthropic, Turigye, Postgres, webhook"
        rows={3}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-white/40 transition-colors mb-8"
      />

      <SectionHeader>Replacements</SectionHeader>
      <p className="text-label-sm text-on-surface-variant mb-3">
        Whatever you say on the left will be typed as whatever's on the right.
      </p>
      <div className="flex gap-2 mb-3">
        <input value={spoken} onChange={(e) => setSpoken(e.target.value)} placeholder="I say…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-white/40" />
        <span className="self-center text-on-surface-variant">→</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Jazz types…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-white/40" />
        <button onClick={add} className="px-4 rounded-lg bg-primary text-on-primary text-label-md font-medium hover:opacity-90 transition-opacity">
          Add
        </button>
      </div>
      <ul className="divide-y divide-white/5 glass rounded-xl">
        {entries.length === 0 && (
          <li className="px-4 py-3 text-on-surface-variant text-label-md">No entries yet.</li>
        )}
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-3 flex items-center justify-between text-label-md">
            <span><span className="text-on-surface-variant">{e.spoken}</span> <span className="text-on-surface-variant">→</span> <span className="text-on-surface font-medium">{e.typed}</span></span>
            <button onClick={() => remove(e.id)} className="text-on-surface-variant hover:text-error transition-colors text-label-sm">Remove</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Tab: Snippets ────────────────────────────────────────────────────────────

function SnippetsTab(): JSX.Element {
  const { config, update } = useConfig()
  const [trigger, setTrigger] = useState('')
  const [expansion, setExpansion] = useState('')
  if (!config) return <></>
  const snippets = config.snippets ?? []

  const add = (): void => {
    if (!trigger.trim() || !expansion.trim()) return
    const next: SnippetEntry = { id: crypto.randomUUID(), trigger: trigger.trim(), expansion }
    void update({ snippets: [...snippets, next] })
    setTrigger(''); setExpansion('')
  }
  const remove = (id: string): void => void update({ snippets: snippets.filter((s) => s.id !== id) })

  return (
    <div>
      <PageHeader title="Snippets" subtitle='Speak a trigger phrase, Jazz pastes the expansion. e.g. "insert my email" → your address.' />
      <div className="mb-4 border-t border-outline-variant/60">
        <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Trigger phrase"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-white/40" />
        <textarea value={expansion} onChange={(e) => setExpansion(e.target.value)} placeholder="Expansion text" rows={3}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-white/40" />
        <button onClick={add} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-medium hover:opacity-90 transition-opacity">
          Add snippet
        </button>
      </div>
      <ul className="divide-y divide-white/5 glass rounded-xl">
        {snippets.length === 0 && (
          <li className="px-4 py-3 text-on-surface-variant text-label-md">No snippets yet.</li>
        )}
        {snippets.map((s) => (
          <li key={s.id} className="px-4 py-3 flex items-start justify-between gap-3 text-label-md">
            <span className="min-w-0">
              <span className="text-primary">"{s.trigger}"</span>{' '}
              <span className="text-on-surface-variant">→</span>{' '}
              <span className="text-on-surface">{s.expansion}</span>
            </span>
            <button onClick={() => remove(s.id)} className="text-on-surface-variant hover:text-error transition-colors text-label-sm shrink-0">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Tab: Transcripts ─────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function TranscriptsTab(): JSX.Element {
  const [records, setRecords] = useState<TranscriptRecord[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = (): void => { void window.jazz.getTranscripts().then(setRecords) }
  useEffect(() => {
    refresh()
    return window.jazz.onTranscriptAdded(() => refresh())
  }, [])

  function copy(t: TranscriptRecord): void {
    // Route via main process — navigator.clipboard.writeText silently fails when
    // the session permission handler doesn't whitelist 'clipboard-write'.
    window.jazz.writeClipboard(t.text)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId((id) => id === t.id ? null : id), 1500)
  }

  async function reinject(t: TranscriptRecord): Promise<void> {
    await window.jazz.reinjectTranscript(t.id)
  }

  async function clearAll(): Promise<void> {
    await window.jazz.clearTranscripts()
    refresh()
  }

  return (
    <div>
      <PageHeader
        title="Transcripts"
        subtitle="Recent dictations. Copy to clipboard or re-inject into the focused app."
        action={
          records.length > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-on-surface-variant text-label-md hover:border-white/30 hover:text-on-surface transition-colors"
            >
              <Icon name="delete_sweep" size={16} />
              Clear all
            </button>
          )
        }
      />

      {records.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center">
          <Icon name="history" size={36} className="text-on-surface-variant" />
          <p className="text-on-surface mt-3 mb-1">No transcripts yet</p>
          <p className="text-label-sm text-on-surface-variant">
            Hold {HOTKEYS.pushToTalk.split('+').map((t, i, arr) => (
              <span key={i}>
                <KbdChip>{keyLabel(t, PLATFORM)}</KbdChip>{i < arr.length - 1 && !IS_MAC && <span className="mx-0.5">+</span>}{' '}
              </span>
            ))}anywhere and start speaking.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((t) => (
            <li key={t.id} className="glass rounded-xl p-4 group hover:bg-white/[0.06] transition-colors">
              <div className="flex justify-between items-baseline mb-2 text-label-sm text-on-surface-variant tabular-nums">
                <span>{relTime(t.timestamp)}</span>
                <span>{(t.durationMs / 1000).toFixed(1)}s</span>
              </div>
              <p className="text-body-md text-on-surface leading-relaxed mb-3">{t.text}</p>
              <div className="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => copy(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 text-on-surface-variant text-label-sm hover:border-white/30 hover:text-on-surface transition-colors"
                >
                  <Icon name={copiedId === t.id ? 'check' : 'content_copy'} size={14} />
                  {copiedId === t.id ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => void reinject(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 text-on-surface-variant text-label-sm hover:border-white/30 hover:text-on-surface transition-colors"
                >
                  <Icon name="redo" size={14} />
                  Re-inject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Tab: About ───────────────────────────────────────────────────────────────

function AboutTab(): JSX.Element {
  const { config } = useConfig()
  return (
    <div>
      <PageHeader title="About" />
      <div className="glass rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Icon name="graphic_eq" size={28} className="text-primary" />
          <div>
            <h3 className="text-headline-sm text-on-surface">Jazz</h3>
            <p className="text-label-sm text-on-surface-variant">v{APP_VERSION} · offline voice dictation</p>
          </div>
        </div>
        <p className="text-body-md text-on-surface-variant">
          100% on-device. Your audio never leaves your machine.
        </p>
      </div>
      <div className="mb-6 border-t border-outline-variant/60">
        <Row title="Active model" control={
          <span className="text-label-md text-on-surface">{config ? modelLabel(config.activeModel, PLATFORM).split(' ★')[0] : '—'}</span>
        } />
        <Row title="Speech engine" control={
          <span className="text-label-md text-on-surface">{IS_MAC ? 'whisper.cpp · Metal' : 'whisper.cpp · CUDA 12'}</span>
        } />
      </div>
      <div className="flex gap-2">
        <button onClick={() => void window.jazz.openLogs()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors">
          <Icon name="description" size={18} />
          Open logs
        </button>
        <button onClick={() => window.jazz.quitApp()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-on-surface text-label-md hover:border-white/30 transition-colors">
          <Icon name="power_settings_new" size={18} />
          Quit Jazz
        </button>
      </div>
      <p className="text-label-sm text-on-surface-variant/70 mt-8">
        Built with Electron, React, whisper.cpp. Inspired by Wispr Flow.
      </p>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const { config, load } = useConfig()
  useEffect(() => { void load() }, [load])

  return (
    <div className="flex w-full h-screen text-on-surface ambient-glow">
      {/* Sidebar */}
      <nav className="w-60 shrink-0 border-r border-outline-variant/70 flex flex-col p-5 ambient-glow-brass">
        <div className="mb-9 flex items-center gap-2.5">
          <Icon name="graphic_eq" size={20} className="text-brass" strokeWidth={2} />
          <div>
            <h1 className="text-headline-sm text-cream leading-none w-expanded">Jazz</h1>
            <p className="font-mono text-[10px] text-cream-faint mt-1 tracking-wider">v{APP_VERSION}</p>
          </div>
        </div>
        <ul className="flex flex-col flex-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  // Active state is a brass rule under the label, not a filled
                  // pill — a marked position on a panel, not a selected chip.
                  className={`w-full text-left flex items-center gap-3 py-2.5 border-b transition-colors duration-150 ${
                    active
                      ? 'border-brass text-brass-bright'
                      : 'border-transparent text-cream-dim hover:text-cream'
                  }`}
                >
                  <Icon name={t.icon} size={15} strokeWidth={active ? 2 : 1.6} />
                  <span className="text-plate-lg uppercase w-condensed">{t.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="border-t border-outline-variant/70 pt-4 text-plate uppercase text-cream-faint leading-relaxed">
          Hold{' '}
          <span className="font-mono text-brass-dim normal-case tracking-normal">
            {formatChord(config?.pushToTalkHotkey ?? HOTKEYS.pushToTalk, PLATFORM)}
          </span>{' '}
          to dictate
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-10">
        {!config ? (
          <p className="text-on-surface-variant">Loading…</p>
        ) : (
          <>
            {tab === 'general'     && <GeneralTab />}
            {tab === 'model'       && <ModelTab />}
            {tab === 'hotkeys'     && <HotkeysTab />}
            {tab === 'dictionary'  && <DictionaryTab />}
            {tab === 'snippets'    && <SnippetsTab />}
            {tab === 'transcripts' && <TranscriptsTab />}
            {tab === 'about'       && <AboutTab />}
          </>
        )}
      </main>
    </div>
  )
}
