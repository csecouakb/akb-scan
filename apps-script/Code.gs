const ROOT_FOLDER_ID = "1mzdpQMxR_lW27YmdpO51VsXptAlmbdQO";
const SHEET_ID = "1JmHABfFYfNHtSeZbg6O3TV7egfDI9dF3VuBKLennujw";

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Responses");
    if (!sheet) throw new Error('Sheet "Responses" পাওয়া যায়নি');

    if (body.action === "start") {
      const options = normalizeOptions(body.options || {});
      const folderName = safe(body.reference + "_" + body.name);
      const folder = root.createFolder(folderName);
      const sl = Math.max(1, sheet.getLastRow());
      sheet.appendRow([
        sl, new Date(), body.reference, body.name, body.note || "", "", "",
        folder.getUrl(), "", optionLabel(options), "Receiving", ""
      ]);
      const row = sheet.getLastRow();
      formatSubmissionRow(sheet, row);
      return reply({ ok: true, folderId: folder.getId(), folderUrl: folder.getUrl() });
    }

    if (body.action === "upload") {
      const folder = DriveApp.getFolderById(body.folderId);
      const bytes = Utilities.base64Decode(body.base64);
      const blob = Utilities.newBlob(bytes, body.mimeType, safe(body.fileName));
      const file = folder.createFile(blob);
      return reply({ ok: true, fileUrl: file.getUrl() });
    }

    if (body.action === "finish") {
      const values = sheet.getDataRange().getValues();
      for (let i = values.length - 1; i >= 1; i--) {
        if (String(values[i][2]) === String(body.reference)) {
          const row = i + 1;
          const fileUrls = body.fileUrls || [];
          sheet.getRange(row, 9).setValue(fileUrls.join("\n"));
          sheet.getRange(row, 11).setValue("Received");
          sheet.getRange(row, 12).setValue("");

          try {
            const options = parseOptionLabel(String(values[i][9] || ""));
            if (options.extractText || options.autoSubject) {
              const result = analyzeSubmissionFiles(fileUrls, options);
              if (result.subject) sheet.getRange(row, 6).setValue(result.subject);
              if (result.text) sheet.getRange(row, 7).setValue(result.text);
              if (result.shortName) renameSubmissionFiles(fileUrls, result.shortName);
              sheet.getRange(row, 12).setValue("AI OK");
            }
          } catch (aiError) {
            const msg = String((aiError && aiError.message) || aiError);
            console.log("AI processing skipped/failed: " + msg);
            sheet.getRange(row, 12).setValue(msg);
          }

          formatSubmissionRow(sheet, row);
          return reply({ ok: true });
        }
      }
      throw new Error("Reference not found");
    }

    return reply({ ok: false, error: "Unknown action" });
  } catch (error) {
    return reply({ ok: false, error: String((error && error.message) || error) });
  }
}

function formatSubmissionRow(sheet, row) {
  sheet.setRowHeight(row, 28);
  [5, 6, 7, 9, 12].forEach(function(col) {
    sheet.getRange(row, col).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  });
}

function normalizeOptions(o) {
  return {
    enhance: !!o.enhance,
    extractText: o.extractText !== false,
    autoSubject: o.autoSubject !== false
  };
}

function optionLabel(o) {
  const list = [];
  if (o.enhance) list.push("Enhance");
  if (o.extractText) list.push("Text");
  if (o.autoSubject) list.push("Subject");
  return list.join(", ") || "None";
}

function parseOptionLabel(label) {
  return {
    enhance: /(^|,\s*)Enhance(,|$)/i.test(label),
    extractText: /(^|,\s*)Text(,|$)/i.test(label),
    autoSubject: /(^|,\s*)Subject(,|$)/i.test(label)
  };
}

function analyzeSubmissionFiles(fileUrls, options) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY Script Property পাওয়া যায়নি");

  const model = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-3.5-flash";
  const parts = [];

  for (const url of fileUrls || []) {
    const id = driveIdFromUrl(url);
    if (!id) continue;

    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    const mime = blob.getContentType() || "application/octet-stream";

    if (!/^image\//i.test(mime) && mime !== "application/pdf") continue;

    parts.push({
      inlineData: {
        mimeType: mime,
        data: Utilities.base64Encode(blob.getBytes())
      }
    });
  }

  if (!parts.length) return { text: "", subject: "", shortName: "" };

  const instruction = [
    "একবারেই নিচের তিনটি কাজ করো। একই নথির জন্য আলাদা বিশ্লেষণ বা আলাদা উত্তর দেবে না।",
    "১) সংযুক্ত নথি/ছবিগুলো থেকে দৃশ্যমান লেখা যতটা সম্ভব হুবহু তুলে দাও। কোনো লেখা অনুমান করে বানাবে না। অস্পষ্ট হলে [অস্পষ্ট] লিখবে। বাংলা লেখা বাংলাতেই এবং ইংরেজি ইংরেজিতেই রাখবে।",
    options.autoSubject
      ? "২) সব নথির মূল বিষয় দেখে সংক্ষিপ্ত ও অর্থবহ একটি বাংলা subject তৈরি করো।"
      : "২) subject খালি রাখো।",
    "৩) subject-এর ভিত্তিতে আরও ছোট, পরিষ্কার ও file-name উপযোগী একটি shortName তৈরি করো। সাধারণত 3-8টি শব্দের মধ্যে রাখবে। extension লিখবে না। / \\ : * ? \" < > | ব্যবহার করবে না।",
    options.extractText ? "text পূর্ণ OCR text হবে।" : "text খালি রাখো।",
    "শুধু JSON ফেরত দাও এই shape-এ: {\"text\":\"...\",\"subject\":\"...\",\"shortName\":\"...\"}"
  ].join("\n");

  parts.unshift({ text: instruction });

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

  const payload = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  // Deliberately only ONE Gemini request per submission to save quota/credits.
  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error("Gemini HTTP " + code + ": " + body.slice(0, 500));
  }

  const parsed = JSON.parse(body);
  const text = parsed && parsed.candidates && parsed.candidates[0] &&
    parsed.candidates[0].content && parsed.candidates[0].content.parts &&
    parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;

  if (!text) throw new Error("Gemini কোনো result দেয়নি");

  let result;
  try {
    result = JSON.parse(text);
  } catch (_) {
    const cleaned = String(text)
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    result = JSON.parse(cleaned);
  }

  return {
    text: options.extractText ? String(result.text || "") : "",
    subject: options.autoSubject ? String(result.subject || "") : "",
    shortName: safeShortName(result.shortName || result.subject || "Document")
  };
}

function renameSubmissionFiles(fileUrls, shortName) {
  const urls = fileUrls || [];
  const base = safeShortName(shortName || "Document");

  urls.forEach(function(url, index) {
    const id = driveIdFromUrl(url);
    if (!id) return;

    const file = DriveApp.getFileById(id);
    const oldName = file.getName();
    const dot = oldName.lastIndexOf(".");
    const ext = dot > 0 ? oldName.slice(dot) : "";
    const suffix = urls.length > 1 ? "_" + String(index + 1).padStart(2, "0") : "";

    file.setName(base + suffix + ext);
  });
}

function safeShortName(value) {
  return String(value || "Document")
    .replace(/[\/:*?"<>|\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Document";
}

function driveIdFromUrl(url) {
  const s = String(url || "");
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : "";
}

function safe(value) {
  return String(value || "")
    .replace(/[\/:*?"<>|\x00-\x1F]/g, "_")
    .slice(0, 140) || "attachment";
}
