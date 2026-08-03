// electron-builder afterPack hook.
//
// For personal/unsigned macOS builds (no Developer ID), electron-builder skips
// code signing entirely — but Apple Silicon refuses to launch unsigned Mach-O,
// and macOS won't keep a TCC grant (Accessibility, Automation) for an
// anonymously ad-hoc-signed app, since that signature's identity changes with
// every rebuild. If a locally-created "Jazz Local Dev" self-signed certificate
// exists in the keychain (see docs/MAC_TESTER.md), we sign with that instead —
// a stable identity that survives rebuilds, so Accessibility/Automation grants
// don't need to be re-approved after every `npm run dist`. Falls back to
// anonymous ad-hoc signing if that certificate isn't present (e.g. a fresh
// clone or CI). When a real signing identity IS configured (CSC_LINK / an
// Apple ID for notarization), we do nothing and let electron-builder sign
// properly.
//
// Entitlements are applied here too (previously this hook signed with none at
// all) — but NOT hardened runtime (`--options runtime`), despite hardenedRuntime
// being set in package.json's mac config for the real notarized path. Hardened
// runtime enforces Library Validation: every loaded framework must share the
// main executable's Team ID. A self-signed cert has no Team ID, so it can never
// satisfy that check — tried this, the app was silently killed by the kernel
// before any window opened (OS_REASON_DYLD, Electron Framework "different Team
// IDs") because it couldn't even load its own bundled Electron Framework. It
// isn't needed anyway: what fixes the repeated Accessibility/Automation
// resets is a stable signing *identity*, which entitlements alone provide
// without hardened runtime's library-loading restrictions.
const { execFileSync } = require('child_process')
const { join } = require('path')

const LOCAL_DEV_IDENTITY = 'Jazz Local Dev'
const ENTITLEMENTS_PATH = join(__dirname, '..', 'resources', 'entitlements.mac.plist')

function hasLocalDevCert() {
  try {
    execFileSync('security', ['find-certificate', '-c', LOCAL_DEV_IDENTITY], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Does the keychain hold a certificate electron-builder will sign with itself?
 * If so this hook must stand down: electron-builder signs *after* afterPack, so
 * anything done here is overwritten, and signing twice with two different
 * identities only makes build logs lie about what shipped.
 */
function builderWillSign() {
  if (process.env.CSC_NAME || process.env.CSC_LINK || process.env.CSC_IDENTITY) return true
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    return !/\b0 valid identities found\b/.test(out)
  } catch {
    return false
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_IDENTITY || process.env.APPLE_ID) {
    // Real signing/notarization path — leave electron-builder's signature intact.
    return
  }
  if (builderWillSign()) {
    // electron-builder has a real identity and signs after this hook; leave it
    // alone. scripts/verify-signing.js then asserts the result never drifts.
    return
  }
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  const usingRealIdentity = hasLocalDevCert()
  const identity = usingRealIdentity ? LOCAL_DEV_IDENTITY : '-'
  const args = ['--force', '--deep', '--sign', identity]
  if (usingRealIdentity) {
    // Entitlements only make sense paired with a real (non-anonymous)
    // signature. No --options runtime — see the note above.
    args.push('--entitlements', ENTITLEMENTS_PATH)
  }
  args.push(appPath)
  execFileSync('codesign', args, { stdio: 'inherit' })
  console.log(`  • afterPack: signed ${appName}.app with identity "${identity}"${usingRealIdentity ? ' (entitlements applied, no hardened runtime)' : ''}`)
}
