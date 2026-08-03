import {
  History, Settings, Mic, Keyboard, BookMarked, Zap, Info,
  AudioLines, ChevronDown, FileText, Power, Pencil, Check, Copy,
  CheckCircle2, CloudDownload, Download, ListX, CornerDownLeft,
  ArrowRight, ArrowLeft, RefreshCw, Gauge, MemoryStick, Accessibility,
  HelpCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Material Symbols was a giveaway: it's recognisable on sight and pins the
// interface to Google's visual language, which fights everything else in the
// Studio direction. It was also the last font fetched over the network.
//
// Lucide ships as components — bundled, tree-shaken, offline, and drawn on a
// consistent stroke grid that suits engraved-panel lettering far better than
// Material's filled geometry.
//
// Names are kept as the old Material glyph strings so the dynamic callsites
// (tab definitions, wizard step metadata) keep working untouched.
const ICONS: Record<string, LucideIcon> = {
  history: History,
  settings: Settings,
  mic: Mic,
  keyboard: Keyboard,
  book_2: BookMarked,
  bolt: Zap,
  info: Info,
  graphic_eq: AudioLines,
  expand_more: ChevronDown,
  description: FileText,
  power_settings_new: Power,
  edit: Pencil,
  check: Check,
  content_copy: Copy,
  check_circle: CheckCircle2,
  cloud_download: CloudDownload,
  download: Download,
  delete_sweep: ListX,
  redo: CornerDownLeft,
  arrow_forward: ArrowRight,
  arrow_back: ArrowLeft,
  refresh: RefreshCw,
  speed: Gauge,
  memory: MemoryStick,
  accessibility_new: Accessibility
}

export default function Icon({
  name, size = 18, className, strokeWidth = 1.75
}: {
  name: string
  size?: number
  className?: string
  strokeWidth?: number
}): JSX.Element {
  const Glyph = ICONS[name] ?? HelpCircle
  return <Glyph size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}
