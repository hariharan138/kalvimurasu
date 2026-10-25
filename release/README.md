# Google Play release preparation

The code is prepared for a signed release bundle, but no signed AAB has been produced or approved for submission. Privacy, audience and device testing remain open.

## Build

1. Install dependencies with `npm ci`; use JDK 21 and Android SDK 36.
2. Create or select your private upload key in Android Studio. Keep the key and its backup outside this repository. Do not use the debug key. Preserve an existing release/upload key if this package already has a Play listing.
3. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill it locally, or set `NMMS_UPLOAD_STORE_FILE`, `NMMS_UPLOAD_STORE_PASSWORD`, `NMMS_UPLOAD_KEY_ALIAS` and `NMMS_UPLOAD_KEY_PASSWORD` through your secure environment. Never send passwords in chat or commit them.
4. Run `npm run check:play`, then `npm run bundle:android`.
5. Expected result: `android/app/build/outputs/bundle/release/app-release.aab`. Alternatively use Android Studio → Build → Generate Signed Bundle / APK → Android App Bundle with the release variant.

The release variant rejects missing signing configuration. Default version: 1.3 (code 4). Increase the version code beyond the highest code already uploaded in Play Console. Keep application ID `com.kalvimurasu.nmms` stable if it is already registered.

## Before uploading

- Finalize the privacy policy and its public URL, in-app privacy access, support contact, retention/deletion process, and intended audience. Review `data-safety-review.md`; do not copy it as a public policy.
- If children are in the audience, complete the Families review and implement the required age/parental consent and data controls before distributing this build.
- Complete Data Safety, content rating, app access, ads declaration and target audience accurately in Play Console.
- Upload the signed AAB to internal testing first. Run the Play pre-launch report and review App Bundle Explorer for native library/16 KB compatibility and permissions. Test on a 16 KB device/emulator where applicable.
- Test Android 7/API 24 through API 36, offline first launch, background/resume timer, Back navigation, Tamil input, screen readers, font scaling, rotation and edge-to-edge/system bars on a physical phone. Simulated DOM checks do not replace device testing.
- Test all privacy, consent, deletion and teacher-sync flows with controlled test data and verify the server deployment matches the app.
- Verify the screenshots/feature graphic and developer details. `play-store-icon-512.png` and `store-listing.md` are starting assets.
- If this is a personal account created after 13 November 2023, check the current closed-testing requirement (12 continuously opted-in testers for 14 days before applying for production access).

## Current environment limitation

Gradle has previously been blocked from opening its local file-lock socket (`Operation not permitted`) in this environment. Build the signed bundle in Android Studio/a normal developer terminal if this recurs. An older debug APK in `downloads/` is not the new release and must not be uploaded to Play.

Official references:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://developer.android.com/studio/publish/app-signing
- https://developer.android.com/guide/practices/page-sizes
- https://support.google.com/googleplay/android-developer/answer/14151465
