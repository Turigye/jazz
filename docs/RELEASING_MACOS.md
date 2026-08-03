# Releasing Jazz on macOS

Two things bite every macOS release of an app like this: **permissions that
silently reset**, and **Gatekeeper refusing a downloaded build**. Both have
exact causes and exact fixes. This is what they are.

---

## 1. Why permissions kept resetting (and why they won't now)

macOS ties every TCC grant — Accessibility, Automation, Microphone — to the
app's **code signature**, not its bundle ID or path. Re-sign with a different
identity and macOS treats it as a brand-new application: the old grants no
longer apply, the toggle in System Settings still *looks* enabled, and
`AXIsProcessTrusted()` returns false. The global hotkey stops working and
nothing in the UI explains why.

During development the identity changed repeatedly without anyone noticing:

| Build | Identity | Result |
|---|---|---|
| Early | ad-hoc (`codesign -s -`) | New random identity **every build** |
| Middle | `Jazz Local Dev` self-signed | Stable, until… |
| Later | `Apple Development: …` | Xcode auto-provisioned a cert; electron-builder found it and switched silently |

electron-builder auto-discovers whatever valid signing identity is in the
keychain. Open Xcode once, and a certificate appears that outranks whatever you
were using. The build says nothing. Permissions break days later.

### The guard

`scripts/verify-signing.js` runs as an `afterSign` hook. On the first build it
records the identity to `.signing-identity.json` (gitignored — it is per-machine).
Every later build compares against it and **fails loudly** on any change:

```
Signing identity changed since the last build.
  expected: Apple Development: Turigye Micheal (…)
  got:      ad-hoc (anonymous)
```

To pin an identity explicitly:

```bash
CSC_NAME="Apple Development: Your Name (XXXXXXXXXX)" npm run dist
```

When a change is genuinely intended (renewed certificate, or moving to
Developer ID for a release):

```bash
JAZZ_ALLOW_IDENTITY_CHANGE=1 npm run dist
```

Then re-grant once — this is the only correct way to recover a stale grant,
because toggling the checkbox off and on does **not** force macOS to re-evaluate:

```bash
tccutil reset Accessibility com.mich.jazz
tccutil reset AppleEvents com.mich.jazz
```

Quit Jazz, relaunch, and accept the fresh system prompts.

---

## 2. Distributing a DMG that other people can actually open

**A locally-signed build cannot be distributed.** Check what Gatekeeper decides
before shipping anything:

```bash
spctl -a -vvv -t execute dist-installer/mac-arm64/Jazz.app
```

With an Apple Development certificate the answer is:

```
dist-installer/mac-arm64/Jazz.app: rejected
```

Two independent reasons:

1. **Not notarized.** Anything downloaded carries a quarantine flag. Gatekeeper
   asks Apple whether the build is known; an un-notarized app is refused. On
   macOS 15 the old right-click → Open escape hatch no longer works — the user
   must visit System Settings → Privacy & Security → *Open Anyway*.
2. **Apple Development certificates are device-provisioned.** They are for
   running on *your own* registered machines. Without an embedded
   `embedded.provisionprofile` naming the target Mac, AMFI can refuse to launch
   the app at all on someone else's hardware.

There is no configuration flag that avoids this. Gatekeeper's entire purpose is
to reject unnotarized downloads, so a build cannot be made "not flagged" without
actually notarizing it.

### The only clean path

Requires an **Apple Developer Program membership ($99/year)**:

1. Create a **Developer ID Application** certificate (paid accounts only — an
   Apple Development cert will not do).
2. Create an app-specific password at <https://appleid.apple.com>.
3. Add repository secrets: `APPLE_ID`, `APPLE_TEAM_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, and the base64 Developer ID `.p12` +
   its password.
4. Push a tag. `.github/workflows/mac-build.yml` already signs, notarizes via
   `notarytool`, staples the ticket, and attaches the DMG to a release.

Verify a release build before trusting it:

```bash
spctl -a -vvv -t execute /Applications/Jazz.app   # expect: accepted
xcrun stapler validate /Applications/Jazz.app     # expect: worked
```

### If you are not paying for a membership

Be upfront in the README rather than letting people hit a scary dialog. Ship the
DMG **ad-hoc signed** (more portable across machines than an Apple Development
cert, which may not launch at all elsewhere) and document the one command that
clears the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/Jazz.app
```

Note the trade-off: ad-hoc signing gives a *new identity on every build*, so
your own permissions reset each time you install locally. Keep the local build
on a stable certificate and reserve ad-hoc for release artifacts — the identity
guard will stop you mixing them up by accident.

For sharing work as a portfolio piece, a rejected DMG makes a worse first
impression than a clean repo with screenshots and build instructions. Notarize,
or send the repo.
