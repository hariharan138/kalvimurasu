# Your prepared question bank

Your Google Sheet has already been created and populated with the app's 20,000 questions:

https://docs.google.com/spreadsheets/d/1KnndwSFjBE9wND0EkfdeMMMIV5RZaoVX-EplY1fd6kI/edit

Tabs: Science (5,602), Mathematics (3,536), Social Science (5,562), MAT (5,300). IDs and Tamil/English columns are populated. Answers, section, and enabled fields have dropdowns. You can edit rows immediately.

**Your Apps Script deployment URL is now configured in the app.** New installs automatically attempt to download from it when online. Rebuild and run the Android app, then check Profile → Google Sheets questions for sync status. Use Sync now to retry. The Google endpoint could not be reached from this execution environment, so its public access and full response still need a real-device check.

Configured feed:

https://script.google.com/macros/s/AKfycbxqqzeO4pR1F28TYKPbCTZyHgbc19umApm5P8kRf6G_oIASNo58JoJEn_zWMVJs_m3a/exec

A device already connected to a different feed keeps its previous selection. On that device, paste this URL in Profile and choose Connect & sync to switch.

For a different workbook or general usage, follow the guide below.

---

# Connect Google Sheets to the mobile app

Each question tab becomes a subject. Name one tab `Science` and its questions appear under Science. Add `English` later and the app creates that subject on the next sync. Questions are downloaded to the device and remain usable without internet.

## 1. Prepare the spreadsheet (one time)

1. Create a Google spreadsheet in your own account, or open the one you want to manage.
2. Open **Extensions → Apps Script**.
3. Replace the initial code with the contents of [`Code.gs`](Code.gs), then save.
4. Select **setupQuestionSheets** from the function selector and click **Run**. Authorize access to your spreadsheet when Google asks.
5. Return to the spreadsheet. You now have **Science**, **Mathematics**, **Social Science**, and **MAT**, each with headers and one sample question. Existing nonempty tabs are not overwritten.

This function also records the spreadsheet ID in the script's properties so the web endpoint always reads the correct workbook. Run setup again if you move the code to a different spreadsheet.

## 2. Publish the read-only question feed (one time)

In the Apps Script editor:

1. Choose **Deploy → New deployment**.
2. Select the **Web app** deployment type.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Deploy and copy the web app URL ending in **`/exec`**.
6. Open that URL in a signed-out/incognito browser. It should display JSON with `"schemaVersion":1` and `"subjects"`, without a Google login. If it displays an `error`, fix the sheet/row described and reload.

The feed exposes the enabled question content to anyone with its URL. It does not grant spreadsheet editing access. Hidden tabs, tabs starting with `_`, and tabs without `question_en` headers are not exported. Keep this workbook for publishable learning content. If your account does not offer Anyone access, this anonymous-feed setup needs a different account or an authenticated backend.

Use the `/exec` deployment URL, **not** the normal spreadsheet `/edit` link, the script editor link, or the testing `/dev` URL. The app follows Google's content-service redirects using native HTTP on Android.

## 3. Connect the app

For your current device:

1. Rebuild and run the updated Android app.
2. Open **Profile → Google Sheets questions**.
3. Paste the `/exec` URL and tap **Connect & sync**.
4. Wait for the saved-offline confirmation. Open Home or Practice and select a synced subject.
5. Turn on airplane mode and verify its questions still open.

To pre-connect **all new installs**, paste the same URL into [`nmms-pwa/sheet-config.js`](../nmms-pwa/sheet-config.js):

```js
window.NMMS_SHEET_ENDPOINT = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

Then run `npm run sync:android` and rebuild the app. Each new install downloads the sheet when it first has internet; until then the existing 20,000 bundled questions remain available. A device already connected through Profile keeps its selected feed. Never paste a password or access token into this file.

## 4. Add or edit questions whenever you like

One row is one question. Header names must match exactly:

| Columns | What to enter |
| --- | --- |
| `id` | A unique, permanent ID within the tab, e.g. `science-002`. Keep it when editing; do not reuse it for a different question. |
| `question_en`, `question_ta` | English and Tamil question text. |
| `option_a_en`, `option_a_ta` | Option A in both languages. |
| `option_b_en`, `option_b_ta` | Option B in both languages. |
| `option_c_en`, `option_c_ta` | Option C in both languages. |
| `option_d_en`, `option_d_ta` | Option D in both languages. |
| `answer` | Correct option: `A`, `B`, `C`, or `D`. |
| `explanation_en`, `explanation_ta` | Explanation in both languages. |
| `topic_en`, `topic_ta` | Topic in both languages. |
| `section` | `MAT` or `SAT`. If blank, the MAT tab defaults to MAT; other tabs default to SAT. |
| `enabled` | `TRUE` to include; `FALSE` to remove the question from the next download. Blank defaults to enabled. |

All columns except `section` and `enabled` are required. Numeral-only options may use the same numeral in both language columns. Entirely blank rows are ignored. Duplicate IDs, missing fields, or invalid answers reject the whole update, preserving the previous offline bank. Errors identify the tab and row.

To create another subject, add a tab with its subject name, copy the header row, and add questions. No app code change or Google redeployment is needed for row edits or new tabs. Redeploy the **same deployment** with a new version only when changing Apps Script code.

Sync runs when the app launches, resumes, receives an online event, and every five minutes while visible. You can also tap **Sync now**. It does not run while the app is fully closed. Automatic requests are throttled for one minute, except a new online event. Downloads time out after 30 seconds.

Questions are divided into sets of up to 25. Subject cards from Sheets take priority over same-name bundled subject cards; the original bundled sets remain accessible under All subjects. Deleting/disabling a question or removing/renaming a tab takes effect on the next successful sync. Existing attempts/results retain their original questions and answer keys, including retries.

## Validation and limits

- Supports up to 100 tabs and 50,000 downloaded questions in addition to the bundled bank.
- Downloaded banks use IndexedDB and are committed atomically before being shown.
- Sync errors, invalid JSON, sign-in responses, and offline-cache write failures leave the previous bank unchanged.
- Scores and answers stay on the device; this feed does not upload student progress to Google Sheets.
- Clear app data/uninstalling removes local downloads and progress.
- Run `npm run check` to verify app and sync logic. These checks use simulated storage/network APIs; an actual Google deployment and Android device connection still need testing.

Google documentation: [web apps](https://developers.google.com/apps-script/guides/web), [JSON content service and redirects](https://developers.google.com/apps-script/guides/content).

## Enable the new student-tracking endpoint

The `_Students` and `_Progress` tabs have already been created in your existing question workbook with the correct headers. They remain private in Drive and are excluded from the public question download. Do not rename them or publish the whole spreadsheet publicly.

The updated app needs the new `doPost` handler in `Code.gs`:

1. In the existing Apps Script project, replace all of Code.gs with the current file from this folder and save.
2. Choose Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy. Keep the existing URL, Execute as Me, and the existing audience.
3. Install the updated APK. Enter student details, finish a practice, then open Profile → Sync progress now while online.
4. Verify the student appears in `_Students` and the attempt in `_Progress`. Repeating Sync must not create another copy of that attempt.

The browser editor could not be updated reliably through the computer-control tool in this session, so the deployed `doPost` upgrade is not yet confirmed. The local app/backend tests passed. Until the deployment is updated, student details and practice records stay queued locally and are retried.

The app does not collect phone numbers or dates of birth. Each device creates its own student ID; reinstallation or use of another device creates a new registration. Only completed/submitted practices are tracked remotely, including retries; an unfinished quiz stays saved on the device.
