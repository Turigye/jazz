// electron-builder afterPack hook.
//
// For personal/unsigned macOS builds (no Developer ID), electron-builder skips
// code signing entirely — but Apple Silicon refuses to launch unsigned Mach-O,
// and macOS won't keep an Accessibility grant for an unsigned app. So we apply
// an ad-hoc signature ourselves once the .app is assembled (before the DMG is
// built from it). When a real signing identity IS configured (CSC_LINK / an
// Apple ID for notarization), we do nothing and let electron-builder sign
// properly.
const { execFileSync } = require('child_process')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_IDENTITY || process.env.APPLE_ID) {
    // Real signing/notarization path — leave electron-builder's signature intact.
    return
  }
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log(`  • afterPack: ad-hoc signed ${appName}.app`)
}
