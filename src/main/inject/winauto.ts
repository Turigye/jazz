import { execFile } from 'child_process'
import { promisify } from 'util'
import log from '../logger'

const execFileAsync = promisify(execFile)

function ps(script: string): Promise<string> {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true }
  ).then((r) => r.stdout.trim())
}

/** Process name (lower-case, no extension) of the current foreground window. */
export async function foregroundProcessName(): Promise<string> {
  const script = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
}
'@
Add-Type $sig
$h = [Fg]::GetForegroundWindow()
$pid2 = 0
[void][Fg]::GetWindowThreadProcessId($h, [ref]$pid2)
(Get-Process -Id $pid2).ProcessName
`.trim()
  try {
    return (await ps(script)).toLowerCase()
  } catch (err) {
    log.warn('foregroundProcessName failed', err)
    return ''
  }
}

/** Send a keystroke combo to the foreground window via SendKeys. */
export async function sendKeys(combo: string): Promise<void> {
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${combo}')`
  await ps(script)
}

export const PASTE = '^v'
export const PASTE_TERMINAL = '^+v'
