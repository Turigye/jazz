# Mac tester handoff

Use this when sending Jazz to someone on macOS.

## Fast path

Send them the current Mac prerelease:

https://github.com/Turigye/jazz/releases/tag/mac-test-latest

Ask them to download the `.dmg`, install it, and report whether launch, permissions, dictation, and the floating orb work correctly.

## Message to send a tester

> Here is a test build of Jazz for macOS:
> https://github.com/Turigye/jazz/releases/tag/mac-test-latest
>
> It is an unsigned test build, so macOS will warn the first time. That is expected.
>
> 1. Download the `.dmg`.
> 2. Open it and drag Jazz into Applications.
> 3. In Applications, right-click Jazz and choose Open.
> 4. Approve Microphone and Accessibility permissions.
> 5. Try dictating into Notes, Chrome, Slack, Cursor, or any text field.
>
> If macOS still blocks it, open Terminal and run:
>
> `xattr -d com.apple.quarantine /Applications/Jazz.app`
>
> Then right-click Jazz and choose Open again.

## What to ask them to test

- Does the `.dmg` download, open, and install?
- Does Jazz launch after right-click -> Open?
- Do Microphone and Accessibility permission prompts appear?
- Does dictation type into normal text fields?
- Does the floating orb click, drag, and stay visually clean?
- Does the orb drift, resize, block clicks, or show weird cursor states?
- What Mac model/chip are they using?
- Any crash, hang, warning, or confusing first-run step?

## Known Mac notes

- This build is unsigned and unnotarized, so Gatekeeper warnings are normal.
- Apple Developer signing/notarization is not set up yet.
- Apple Silicon is the primary target for the current workflow.
- System-audio muting may not behave like Windows yet.
- macOS has not been personally tested by the maintainer yet; tester feedback is needed.

## Building the DMG again

The GitHub workflow is `.github/workflows/mac-build.yml` on the `mac` branch.

To make a new cloud build:

1. Go to GitHub -> Actions.
2. Select `mac-build`.
3. Run it on the `mac` branch, or push to the `mac` branch.
4. Download the `Jazz-macOS-arm64-dmg` artifact, or use the updated `mac-test-latest` prerelease.
