import { execFile } from 'child_process'
import log from './logger'

// Mutes system output while recording so background audio doesn't bleed into
// the mic. Windows uses the Core Audio API (IAudioEndpointVolume) via an
// embedded C# type; macOS uses AppleScript output-muted. Both restore the
// user's prior mute state afterward. (This mutes, not pauses — media keeps
// playing silently and audibly resumes on release.)

const CSHARP = `
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float l, Guid e); int SetMasterVolumeLevelScalar(float l, Guid e);
  int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
  int SetChannelVolumeLevel(uint n, float l, Guid e); int SetChannelVolumeLevelScalar(uint n, float l, Guid e);
  int GetChannelVolumeLevel(uint n, out float l); int GetChannelVolumeLevelScalar(uint n, out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, Guid e);
  int GetMute(out bool m);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int f, int s, out IntPtr d);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ep);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; e.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    return (IAudioEndpointVolume)o;
  }
  public static bool GetMute() { bool b; Vol().GetMute(out b); return b; }
  public static void SetMute(bool m) { Vol().SetMute(m, Guid.Empty); }
}
`

function ps(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
      (err, stdout) => {
        if (err) log.warn('audioduck ps error', err.message)
        resolve((stdout ?? '').trim())
      }
    )
  })
}

/** Run a one-line AppleScript, resolving its stdout (macOS). */
function osa(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (err, stdout) => {
      if (err) log.warn('audioduck osa error', err.message)
      resolve((stdout ?? '').trim())
    })
  })
}

// Remember the user's pre-existing mute state so we never un-mute audio they
// deliberately silenced.
let previousMute = false

/** Mute system output, recording prior state. Fire-and-forget safe. */
export async function muteSystem(): Promise<void> {
  if (process.platform === 'darwin') {
    // Mute the default output so playback doesn't bleed into the mic while
    // dictating. Remember prior state so we never un-mute audio the user
    // deliberately silenced.
    const out = await osa('output muted of (get volume settings)')
    previousMute = /true/i.test(out)
    await osa('set volume with output muted')
    log.debug(`audioduck: muted (prior=${previousMute})`)
    return
  }
  if (process.platform !== 'win32') {
    // TODO: linux (pactl/wpctl).
    return
  }
  const out = await ps(`Add-Type -TypeDefinition @'${CSHARP}'@; $p=[Audio]::GetMute(); [Audio]::SetMute($true); Write-Output $p`)
  previousMute = /true/i.test(out)
  log.debug(`audioduck: muted (prior=${previousMute})`)
}

/** Restore system output to its pre-mute state. */
export async function restoreSystem(): Promise<void> {
  if (process.platform === 'darwin') {
    if (!previousMute) await osa('set volume without output muted')
    log.debug('audioduck: restored')
    return
  }
  if (process.platform !== 'win32') return
  const target = previousMute ? '$true' : '$false'
  await ps(`Add-Type -TypeDefinition @'${CSHARP}'@; [Audio]::SetMute(${target})`)
  log.debug('audioduck: restored')
}
