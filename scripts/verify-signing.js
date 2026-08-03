// electron-builder afterSign hook — identity drift guard.
//
// macOS ties every TCC permission (Accessibility, Automation, Microphone) to
// the app's code signature. Change the signing identity and macOS considers it
// a different application: the old grants no longer apply, the toggle in
// System Settings looks enabled while `AXIsProcessTrusted()` returns false,
// and the only cure is `tccutil reset` followed by re-granting.
//
// That happened repeatedly during development because electron-builder
// auto-discovers whatever signing identity happens to be in the keychain. When
// Xcode silently provisioned an "Apple Development" certificate, the build
// switched to it without a word, and every permission reset again.
//
// The bug was never the identity itself — it was that the identity could
// change without anyone noticing until permissions mysteriously broke. So this
// hook records what was used on the first build and refuses to continue if it
// ever differs.
//
// Deliberately changing identity (a renewed cert, or moving to Developer ID
// for distribution) is fine — rerun with JAZZ_ALLOW_IDENTITY_CHANGE=1 and the
// new identity is recorded as the expected one. Expect to re-grant permissions
// once after doing so.

const { spawnSync } = require('child_process')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const LOCKFILE = join(__dirname, '..', '.signing-identity.json')

/** Read the Authority/TeamIdentifier actually embedded in the built bundle. */
function readSignature(appPath) {
  // codesign writes its report to stderr even on success, so execFileSync —
  // which returns stdout — hands back an empty string and every field parses
  // as null. spawnSync exposes both streams.
  const r = spawnSync('codesign', ['-dv', '--verbose=2', appPath], { encoding: 'utf8' })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const authority = (out.match(/^Authority=(.+)$/m) || [])[1] || null
  const team = (out.match(/^TeamIdentifier=(.+)$/m) || [])[1] || null
  const adhoc = /Signature=adhoc/.test(out)
  return { authority: adhoc ? 'ad-hoc (anonymous)' : authority, team, adhoc }
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  const sig = readSignature(appPath)

  const current = { authority: sig.authority, team: sig.team }
  const label = `${current.authority || 'UNSIGNED'}${current.team ? ` · team ${current.team}` : ''}`

  if (!existsSync(LOCKFILE)) {
    writeFileSync(LOCKFILE, JSON.stringify(current, null, 2) + '\n')
    console.log(`  • signing identity recorded: ${label}`)
    console.log('    Future builds must match this or they will fail.')
    return
  }

  const expected = JSON.parse(readFileSync(LOCKFILE, 'utf8'))
  const same =
    expected.authority === current.authority && expected.team === current.team

  if (same) {
    console.log(`  • signing identity verified: ${label}`)
    return
  }

  if (process.env.JAZZ_ALLOW_IDENTITY_CHANGE === '1') {
    writeFileSync(LOCKFILE, JSON.stringify(current, null, 2) + '\n')
    console.log(`  • signing identity CHANGED (allowed explicitly): ${label}`)
    console.log('    macOS will treat this as a new app — re-grant permissions once:')
    console.log('      tccutil reset Accessibility com.mich.jazz')
    console.log('      tccutil reset AppleEvents com.mich.jazz')
    return
  }

  throw new Error(
    [
      '',
      'Signing identity changed since the last build.',
      '',
      `  expected: ${expected.authority || 'UNSIGNED'}${expected.team ? ` · team ${expected.team}` : ''}`,
      `  got:      ${label}`,
      '',
      'Shipping this would silently reset every macOS permission the app has',
      '(Accessibility, Automation, Microphone) — the global hotkey would stop',
      'working and the Settings toggle would look enabled while doing nothing.',
      '',
      'Most likely cause: another signing certificate appeared in the keychain',
      '(Xcode provisions one automatically) and electron-builder picked it up.',
      'Pin the intended one with CSC_NAME, e.g.',
      '',
      `  CSC_NAME="${expected.authority}" npm run dist`,
      '',
      'If the change IS intended (renewed cert, or Developer ID for release),',
      'rerun with JAZZ_ALLOW_IDENTITY_CHANGE=1 and re-grant permissions once.',
      ''
    ].join('\n')
  )
}
