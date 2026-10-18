# Kalvimurasu NMMS mobile app

Android app built with Capacitor 8 around the existing Tamil/English practice app. All 20,000 questions and illustrations are bundled for offline use from the first launch. The existing browser/PWA version remains in `nmms-pwa/`.

## Run on Android

Requires Node.js 22+, JDK 21, Android Studio 2025.2.1+, and Android SDK 36.

```sh
npm ci
npm run sync:android
npm run open:android
```

In Android Studio, allow Gradle sync to finish, select a phone/emulator, and click Run. Android 7.0/API 24 or newer is supported by the project configuration.

## Build an installable APK

```sh
npm run build:android
```

The debug APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`. This is suitable for local testing. Google Play distribution requires a signed release bundle and your signing key, configured through Android Studio's Generate Signed Bundle / APK workflow. No signing secrets are stored here.

On macOS, select JDK 21 explicitly (Android Studio's bundled JDK may be Java 25, which Gradle 8.14.3 cannot run on):

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
npm run build:android
```

## Editing and verification

Edit `nmms-pwa/`, then run `npm run sync:android`. Do not edit the generated `www/` or Android's copied web assets. `npm run check` validates the mobile bundle and exercises scoring, answer persistence, expiry, language switching, and the JavaScript side of Android Back navigation with a simulated DOM.

Native builds skip service-worker caching because the assets are already packaged. Android Back closes dialogs, returns from quizzes without discarding saved answers, and backgrounds the app from Home. Saved progress is local to the installed app; browser progress is not automatically imported. The question bank still loads in full at startup.

## Validation on this machine

Asset generation, Capacitor Android synchronization, JavaScript syntax, and the simulated app checks passed. A debug build was attempted but Gradle could not create its local file-lock socket (`java.net.SocketException: Operation not permitted`) in the execution sandbox. A debug APK was subsequently built successfully through Android Studio. Its APK signature and bundled app code/default Google Sheets URL were verified. Copies are available at `dist/Kalvimurasu-NMMS-debug.apk` and on the Desktop. Testing on a physical Android phone is still pending.

## iPhone

An iOS target has not been generated. To add one on a network-enabled Mac, install `@capacitor/ios` at the same version as the other Capacitor packages, run `npx cap add ios`, `npm run build:mobile`, `npx cap sync ios`, and `npx cap open ios`. Device deployment requires Apple signing configuration. This path has not been verified in this environment.

Capacitor setup reference: https://capacitorjs.com/docs/getting-started/environment-setup

Android Studio uses `GRADLE_LOCAL_JAVA_HOME`, read from `android/.gradle/config.properties`. On this machine it points to `/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`. This machine-specific file is ignored by Git. On another machine, choose a local JDK 21 under Settings → Build, Execution, Deployment → Build Tools → Gradle.

## Practice features

- Choose Mathematics, Science, Social Science, or Mental Ability practice from Home or the Practice subject filters.
- Selecting an answer immediately shows the explanation, marks the correct option, and plays a short success/error tone. The first answer is locked after the solution appears. Correct options pulse twice; reduced-motion preferences disable the animation.
- Sound can be muted from the quiz toolbar or Profile. The choice is saved locally. Tones are generated with Web Audio and need no network or downloaded sound files.
- Open a result (including one from Progress) and choose **Retry incorrect answers** to practise only its wrong answers. Unanswered questions are excluded. Retry sessions can be resumed after closing the app; their scores are saved as separate history entries.
- Completed set numbers persist independently of the latest 200 result records. Retry subsets do not count as additional completed sets.
- Language changes apply to question text, feedback, explanations, and the new controls.

The mobile checks cover these flows with a simulated DOM and audio API. Actual sound playback, animation, screen layout, and Android system Back behavior still require a device or emulator check. Rebuild and reinstall the Android app after syncing to receive these updates.

## Google Sheets question management

The read-only sheet connector is implemented. Follow [google-sheets/SETUP.md](google-sheets/SETUP.md) to run the supplied Apps Script setup, deploy your feed, and connect it in Profile. Each tab becomes a subject. Questions sync automatically while the app is open/resumed and remain available offline. Set `window.NMMS_SHEET_ENDPOINT` in `nmms-pwa/sheet-config.js` before building to pre-connect new installations. Google account authorization/deployment and a real-device sync have not been completed in this environment.

## Student onboarding and teacher progress

New users enter their name, school, class (6–12), and optional section/roll number before practice. A random student ID is saved on this device. Editing details preserves the ID. Reinstalling/clearing app data creates a new ID; this is device-based registration, not an authenticated cross-device student account. Existing pre-registration practice results are not attributed to a new student.

Registration and completed practice records enter a durable local outbox. The app uploads them on reconnect, next open/resume, submission while online, or Sync progress now. Pending data is removed only after server acknowledgement. Failed uploads retain their IDs and retry. The endpoint deduplicates repeated attempt IDs under a script lock, so lost responses do not inflate scores. It recomputes summary totals from the attempt log. Only submitted practices are uploaded; an unfinished practice stays local.

The teacher sheet has `_Students` (student details, completed practices/sets, answered questions, correct answers, average score, study minutes, last active/sync dates) and `_Progress` (each individual practice). Both tabs are excluded from the public question feed. Student uploads are pinned to `NMMS_PROGRESS_ENDPOINT`, independent of a device's optional alternate question feed. Student text is escaped before being written as spreadsheet cells. Only question content is exposed through GET; POST never returns student details. The current spreadsheet's sharing was verified as owner-only.

The endpoint accepts anonymous, self-reported app results. It is appropriate for practice monitoring, not verified exam scoring. The outbox holds up to 1,000 pending records and reports storage/sync errors rather than discarding them silently. The app must be running or reopened to sync; it does not upload while fully closed.

After changing `google-sheets/Code.gs`, update the same Google Apps Script deployment to a New version before expecting tracking uploads to work. The app queues records until that server upgrade is available.
