# AKB Scan

AKB Scan is an installable document-scanner PWA for mobile and desktop. The main workspace processes images and PDFs in the browser. The public `/submit` page sends original attachments to an owner-controlled Google Drive folder through Google Apps Script, then logs the submission in Google Sheets. Gemini OCR, subject generation, and filename suggestions are optional and best effort.

## Features

- Camera, image, and multi-page PDF import
- Page reorder, rotate, four-corner crop, filters, JPG/PNG/ZIP, combined PDF, and print
- A4, Letter, and Original paper size with orientation and margin controls
- Public sender form with up to 5 files and 10 MB total
- Original-preserving clean copies
- Optional AI/OCR page expressions such as `1`, `1-3`, and `1-3,5`
- One Gemini `generateContent` request per submission, with no automatic retry
- Existing document subjects are copied faithfully; a new subject is generated only when the document has no subject heading
- Installable PWA with cache-version cleanup
- PIN-protected public scanner and owner-only `/admin` workspace
- Durable admin-controlled 4 or 6 digit scanner PIN

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Checks:

```bash
npm run build
npm run lint
```

No API key belongs in frontend code or Git. The core scanner does not need an API key. Production uses `SCANNER_PIN` as the initial PIN, `SCANNER_ACCESS_TOKEN` as the session pepper, and `ADMIN_EMAIL` to allow the Site owner's ChatGPT account into `/admin`.

## Google Apps Script receiver

1. Create or choose a Google Drive root folder and a Google Sheet with a `Responses` tab.
2. Open `apps-script/Code.gs`, set `ROOT_FOLDER_ID` and `SHEET_ID`, and paste the file into an Apps Script project owned by the destination Google account.
3. In **Project Settings → Script properties**, add `GEMINI_API_KEY`. Optionally add `GEMINI_MODEL`; the default is `gemini-3.5-flash`.
4. Deploy as a Web App, executing as the owner and allowing anyone with the URL to call it.
5. Put the deployed `/exec` URL in `RECEIVER_URL` in `app/submit/page.tsx`.

After every receiver-code change, create a new Apps Script deployment version. Updating GitHub does not update the deployed Apps Script.

### Receiver protocol

The browser uses `start → upload → finish`:

- `start` creates the Drive folder, Sheet row, and a random expiring session key.
- `upload` requires the reference, folder ID, and session key. The receiver validates the session, root-folder ancestry, file signature, count, and size.
- Original files are uploaded before clean or AI-analysis copies.
- `finish` marks the safely saved upload as `Received`, then makes at most one Gemini request. AI success changes the status to `AI OK`; AI failure stays in the debug column and never removes the received submission.

For a non-empty AI/OCR page expression, the browser renders only the chosen PDF pages and uploads those temporary page images for Gemini. The complete original PDF remains in Drive. Multiple images use their upload order as page order.

## Google Sheet columns

1. SL
2. Date
3. Reference
4. Name
5. Mobile / note / message
6. Subject
7. Extracted Text
8. Drive Folder
9. File URLs
10. Options
11. Status
12. AI status / debug

`fixOldResponses()` compacts existing rows. `repairOldSubjectText()` conservatively repairs older rows where OCR text was written to Subject.

## Deployment and PWA

The site uses the configuration in `.openai/hosting.json`. Publish through the Sites workflow after a successful build. `public/sw.js` uses versioned caches, removes older caches during activation, never caches API requests, and uses network-first navigation so a stale HTML shell is less likely to keep old code active.

The public sender route is `/submit` and never requires sender sign-in. `/` requires the shared scanner PIN and does not expose the Cloud module. `/admin` requires the configured owner's ChatGPT sign-in; it contains PIN management and the Drive/Sheet Cloud module. A PIN change is stored in D1 and invalidates earlier scanner sessions.

## Architecture rule

AI is optional. Uploading originals and writing the response record are the core transaction. OCR, subject generation, short filenames, and clean copies must not prevent a safely uploaded submission from succeeding.
