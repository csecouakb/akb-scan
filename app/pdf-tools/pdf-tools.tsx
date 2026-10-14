"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

type PageItem = {
  id: string;
  name: string;
  source: "pdf" | "image";
  canvas: HTMLCanvasElement;
  selected: boolean;
};

type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

const uid = () => crypto.randomUUID();

function cloneCanvas(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

function fileToImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ছবি খোলা যায়নি"));
    };
    img.src = url;
  });
}

function imageFileCanvas(img: HTMLImageElement) {
  const max = 2200;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function positionFor(canvas: HTMLCanvasElement, w: number, h: number, pos: OverlayPosition) {
  const pad = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
  if (pos === "top-left") return [pad, pad] as const;
  if (pos === "top-right") return [canvas.width - w - pad, pad] as const;
  if (pos === "bottom-left") return [pad, canvas.height - h - pad] as const;
  if (pos === "center") return [(canvas.width - w) / 2, (canvas.height - h) / 2] as const;
  return [canvas.width - w - pad, canvas.height - h - pad] as const;
}

export default function PdfTools() {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [busy, setBusy] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [targetMb, setTargetMb] = useState("10");
  const [customMb, setCustomMb] = useState("8");
  const [overlayUrl, setOverlayUrl] = useState("");
  const [overlayLabel, setOverlayLabel] = useState("Signature");
  const [overlayPos, setOverlayPos] = useState<OverlayPosition>("bottom-right");
  const [overlaySize, setOverlaySize] = useState(28);
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const overlayInput = useRef<HTMLInputElement>(null);

  const selectedCount = useMemo(() => pages.filter(p => p.selected).length, [pages]);

  async function addPdfFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("PDF প্রস্তুত হচ্ছে…");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const incoming: PageItem[] = [];
      for (const file of Array.from(files)) {
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let n = 1; n <= doc.numPages; n++) {
          setBusy(`${file.name} · পৃষ্ঠা ${n}/${doc.numPages}`);
          const pg = await doc.getPage(n);
          const base = pg.getViewport({ scale: 1 });
          const scale = Math.min(2.6, 1800 / Math.max(base.width, base.height));
          const vp = pg.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = Math.ceil(vp.width);
          c.height = Math.ceil(vp.height);
          await pg.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
          incoming.push({ id: uid(), name: `${file.name} · ${n}`, source: "pdf", canvas: c, selected: false });
          await new Promise(r => setTimeout(r, 0));
        }
      }
      setPages(v => [...v, ...incoming]);
    } catch (error) {
      console.error(error);
      alert("একটি PDF খোলা যায়নি। Password-protected বা ক্ষতিগ্রস্ত হতে পারে।");
    } finally {
      setBusy("");
    }
  }

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("ছবি প্রস্তুত হচ্ছে…");
    try {
      const incoming: PageItem[] = [];
      for (const file of Array.from(files)) {
        const img = await fileToImage(file);
        incoming.push({ id: uid(), name: file.name, source: "image", canvas: imageFileCanvas(img), selected: false });
      }
      setPages(v => [...v, ...incoming]);
    } finally {
      setBusy("");
    }
  }

  function toggle(id: string) {
    setPages(v => v.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  }

  function removeSelected() {
    if (!selectedCount) return;
    setPages(v => v.filter(p => !p.selected));
  }

  function rotateSelected() {
    setPages(v => v.map(p => {
      if (!p.selected) return p;
      const src = p.canvas;
      const c = document.createElement("canvas");
      c.width = src.height;
      c.height = src.width;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(src, 0, 0);
      return { ...p, canvas: c };
    }));
  }

  function onDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    setPages(v => {
      const next = [...v];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function loadOverlay(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setOverlayUrl(old => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
    setOverlayLabel(file.name);
  }

  async function applyOverlay() {
    if (!overlayUrl) return alert("আগে Signature/Image upload করুন।");
    if (!selectedCount) return alert("যেসব page-এ বসাবেন সেগুলো select করুন।");
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Overlay image load failed"));
      img.src = overlayUrl;
    });
    setPages(v => v.map(p => {
      if (!p.selected) return p;
      const c = cloneCanvas(p.canvas);
      const maxW = c.width * (overlaySize / 100);
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = Math.max(40, maxW);
      const h = w * ratio;
      const [x, y] = positionFor(c, w, h, overlayPos);
      c.getContext("2d")!.drawImage(img, x, y, w, h);
      return { ...p, canvas: c };
    }));
  }

  function desiredPages(selectedOnly: boolean) {
    const chosen = selectedOnly ? pages.filter(p => p.selected) : pages;
    return chosen.length ? chosen : pages;
  }

  function makePdf(items: PageItem[], quality: number, scale: number) {
    if (!items.length) throw new Error("No pages");
    const first = items[0].canvas;
    const firstPortrait = first.height >= first.width;
    const pdf = new jsPDF({
      unit: "pt",
      format: firstPortrait ? "a4" : "a4",
      orientation: firstPortrait ? "portrait" : "landscape",
      compress: true,
    });
    items.forEach((item, i) => {
      const c = item.canvas;
      const portrait = c.height >= c.width;
      if (i) pdf.addPage("a4", portrait ? "portrait" : "landscape");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const ratio = Math.min((pw - margin * 2) / c.width, (ph - margin * 2) / c.height) * scale;
      const w = c.width * ratio;
      const h = c.height * ratio;
      pdf.addImage(c.toDataURL("image/jpeg", quality), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
    });
    return pdf;
  }

  async function exportPdf(selectedOnly = false) {
    const items = desiredPages(selectedOnly);
    if (!items.length) return;
    setBusy("PDF তৈরি হচ্ছে…");
    try {
      const target = Math.max(0.5, Number(targetMb === "custom" ? customMb : targetMb) || 10) * 1024 * 1024;
      const qualities = [0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.34];
      const scales = [1, 0.92, 0.82, 0.72, 0.62];
      let best = makePdf(items, qualities[0], scales[0]);
      let bestBytes = best.output("arraybuffer").byteLength;
      outer: for (const scale of scales) {
        for (const quality of qualities) {
          setBusy(`সাইজ optimize হচ্ছে… ${Math.round(quality * 100)}%`);
          const candidate = makePdf(items, quality, scale);
          const size = candidate.output("arraybuffer").byteLength;
          if (size < bestBytes) {
            best = candidate;
            bestBytes = size;
          }
          if (size <= target) {
            best = candidate;
            break outer;
          }
          await new Promise(r => setTimeout(r, 0));
        }
      }
      best.save(selectedOnly ? "AKB-PDF-selected.pdf" : "AKB-PDF-tools.pdf");
      if (bestBytes > target) alert(`সবচেয়ে ছোট export প্রায় ${(bestBytes / 1024 / 1024).toFixed(1)} MB হয়েছে। এই document-কে নির্বাচিত limit-এর নিচে নামানো যায়নি।`);
    } finally {
      setBusy("");
    }
  }

  async function exportImagesZip() {
    const items = desiredPages(selectedCount > 0);
    if (!items.length) return;
    setBusy("JPG ZIP তৈরি হচ্ছে…");
    try {
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        const blob = await new Promise<Blob>((resolve, reject) => items[i].canvas.toBlob(b => b ? resolve(b) : reject(new Error("JPG failed")), "image/jpeg", 0.92));
        zip.file(`AKB-PDF-page-${i + 1}.jpg`, blob);
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "AKB-PDF-pages.zip");
    } finally {
      setBusy("");
    }
  }

  const button: React.CSSProperties = { border: "1px solid #d0d5dd", borderRadius: 10, padding: "10px 14px", background: "white", cursor: "pointer", fontWeight: 700 };
  const primary: React.CSSProperties = { ...button, background: "#111827", color: "white", borderColor: "#111827" };

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#111827", padding: "24px" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto" }}>
        <header style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, color: "#667085", marginBottom: 4 }}>AKB Scan</div>
            <h1 style={{ fontSize: 30, margin: 0 }}>PDF Tools</h1>
            <p style={{ color: "#667085", margin: "6px 0 0" }}>Upload • Merge • Split • Reorder • Delete • Signature • Convert • Compress</p>
          </div>
          <Link href="/" style={{ ...button, textDecoration: "none" }}>← Scanner</Link>
        </header>

        <section style={{ background: "white", border: "1px solid #e4e7ec", borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button style={primary} onClick={() => pdfInput.current?.click()}>PDF Upload</button>
            <button style={button} onClick={() => imageInput.current?.click()}>Image → PDF</button>
            <input ref={pdfInput} type="file" accept="application/pdf" multiple hidden onChange={e => addPdfFiles(e.target.files)} />
            <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={e => addImages(e.target.files)} />
            <button style={button} onClick={() => setPages(v => v.map(p => ({ ...p, selected: true })))}>সব Select</button>
            <button style={button} onClick={() => setPages(v => v.map(p => ({ ...p, selected: false })))}>Unselect</button>
            <button style={button} onClick={rotateSelected} disabled={!selectedCount}>Rotate Selected</button>
            <button style={{ ...button, color: "#b42318" }} onClick={removeSelected} disabled={!selectedCount}>Delete Selected</button>
            <button style={{ ...button, marginLeft: "auto" }} onClick={() => setPages([])}>Clear</button>
          </div>
          <div style={{ marginTop: 12, color: "#667085", fontSize: 14 }}>{pages.length} page • {selectedCount} selected</div>
        </section>

        <section style={{ background: "white", border: "1px solid #e4e7ec", borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Signature / Image Add</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button style={button} onClick={() => overlayInput.current?.click()}>Signature / Image Upload</button>
            <input ref={overlayInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={loadOverlay} />
            <select value={overlayPos} onChange={e => setOverlayPos(e.target.value as OverlayPosition)} style={button}>
              <option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="center">Center</option>
            </select>
            <label style={{ color: "#475467" }}>Size {overlaySize}% <input type="range" min="8" max="60" value={overlaySize} onChange={e => setOverlaySize(Number(e.target.value))} /></label>
            <button style={primary} onClick={applyOverlay}>Selected pages-এ বসান</button>
            {overlayUrl && <span style={{ fontSize: 13, color: "#667085" }}>{overlayLabel}</span>}
          </div>
        </section>

        <section style={{ background: "white", border: "1px solid #e4e7ec", borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Export Settings</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={targetMb} onChange={e => setTargetMb(e.target.value)} style={button}>
              <option value="5">Max 5 MB</option><option value="10">Max 10 MB</option><option value="20">Max 20 MB</option><option value="custom">Custom</option>
            </select>
            {targetMb === "custom" && <input value={customMb} onChange={e => setCustomMb(e.target.value)} type="number" min="0.5" step="0.5" style={{ ...button, width: 110 }} placeholder="MB" />}
            <button style={primary} onClick={() => exportPdf(false)} disabled={!pages.length}>Export All PDF</button>
            <button style={button} onClick={() => exportPdf(true)} disabled={!selectedCount}>Export Selected / Split</button>
            <button style={button} onClick={exportImagesZip} disabled={!pages.length}>PDF → JPG ZIP</button>
          </div>
          <p style={{ color: "#667085", fontSize: 13, marginBottom: 0 }}>5/10/20 MB হলো target limit; document-এর content অনুযায়ী exact size সবসময় সম্ভব নাও হতে পারে।</p>
        </section>

        <section style={{ background: "white", border: "1px solid #e4e7ec", borderRadius: 16, padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Page Organizer</h2>
          <p style={{ color: "#667085", marginTop: -4 }}>Page ধরে drag করে sorting করুন। Click করলে select/unselect হবে।</p>
          {!pages.length ? <div style={{ padding: 42, textAlign: "center", color: "#98a2b3", border: "2px dashed #e4e7ec", borderRadius: 14 }}>PDF বা image upload করুন</div> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14 }}>
            {pages.map((p, index) => (
              <article key={p.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(e: DragEvent) => e.preventDefault()} onDrop={() => onDrop(index)} onClick={() => toggle(p.id)} style={{ border: `2px solid ${p.selected ? "#2563eb" : "#e4e7ec"}`, borderRadius: 14, padding: 10, background: p.selected ? "#eff6ff" : "#f9fafb", cursor: "grab", position: "relative" }}>
                <div style={{ position: "absolute", right: 8, top: 8, width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", background: p.selected ? "#2563eb" : "white", color: p.selected ? "white" : "#667085", border: "1px solid #d0d5dd", fontSize: 12 }}>{p.selected ? "✓" : index + 1}</div>
                <img src={p.canvas.toDataURL("image/jpeg", 0.72)} alt="page preview" style={{ width: "100%", aspectRatio: "0.72", objectFit: "contain", background: "white", borderRadius: 8, border: "1px solid #eaecf0" }} />
                <div title={p.name} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              </article>
            ))}
          </div>}
        </section>
      </div>
      {busy && <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.48)", display: "grid", placeItems: "center", zIndex: 50 }}><div style={{ background: "white", borderRadius: 14, padding: "18px 24px", fontWeight: 800 }}>{busy}</div></div>}
    </main>
  );
}
