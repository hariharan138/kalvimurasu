# Data Safety review — current implementation, not a completed declaration

Review date: 24 October 2026. Reassess after any privacy or tracking changes.

## What the code currently does

- Requires student name, school and class before starting practice. Section, Tamil Nadu district and school block are optional. These values are included with the student profile when supplied. A locally generated student ID links registration and results.
- Stores the profile, question feed cache, quiz answers, history and pending uploads on the device.
- Uploads student profile details and completed practice data (subject, set, score, counts, timestamps and duration) to the configured Google Apps Script/Google Sheets destination.
- Keeps queued uploads until acknowledged; removing/uninstalling local app data does not remove already uploaded spreadsheet records.
- Downloads question updates from Google Apps Script and uses Google-hosted infrastructure to deliver the responses.
- Requests INTERNET permission. The project contains no advertising SDK, advertising-ID request, billing, location, microphone, camera or contacts access.
- Uses HTTPS for the configured remote endpoints. Do not describe the app as collecting no data or working entirely without network requests.

## Owner decisions needed

Identify the data controller, support/privacy contact, hosting/deletion URLs, retention periods and responsible spreadsheet operator. Determine the intended age bands and applicable child/parental consent flow. Decide whether teacher sharing is optional or required. Determine whether this registration meets Play's account definition; implement the applicable in-app and web deletion mechanism, and verify it deletes server-side records as well as local data.

Map personal information, user IDs and app activity to the current Play Console questionnaire. Assess whether transfers to the teacher/operator and Google are collection, sharing or service-provider processing under Play's definitions. Do not claim a service-provider exception without reviewing the actual relationship.

The privacy policy must name NMMS Spark/the developer, disclose the data, recipients, purposes, retention and deletion process, and provide a contact. It must be available publicly and inside the app. These are release blockers until finalized.

References:
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/9893335
