/**
 * Shared PDF and HTML utility functions.
 *
 * Consolidates duplicated helpers that were previously defined independently
 * in multiPaperChatCore.ts, readerPane.ts, and contextMenu.ts.
 */

// ---------- HTML escaping ----------

/** Escape HTML special characters (including quotes for use in attributes). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- PDF attachment helpers ----------

/**
 * Find the best PDF attachment for a Zotero item.
 * If the item itself is a PDF attachment, return it directly.
 * If it's a regular item, search its child attachments for a PDF.
 */
export function getBestPdfAttachment(item: any): any {
  if (item.isAttachment?.() && item.attachmentContentType === "application/pdf") return item;
  if (item.isRegularItem?.()) {
    for (const id of (item.getAttachments?.() || [])) {
      const att = Zotero.Items.get(id);
      if (att && !att.isNote() && att.attachmentContentType === "application/pdf") return att;
    }
  }
  return null;
}

// ---------- PDF text extraction ----------

/**
 * Extract full text from a PDF attachment using Zotero's fulltext index.
 * Triggers indexing if not already indexed and waits briefly.
 */
export async function getPdfText(item: any): Promise<string | null> {
  try {
    // @ts-ignore — Zotero.Fulltext types not fully available
    const state = await Zotero.Fulltext.getIndexedState(item);
    // @ts-ignore
    const INDEX_STATE_INDEXED = Zotero.Fulltext.INDEX_STATE_INDEXED ?? 2;

    if (state !== INDEX_STATE_INDEXED) {
      Zotero.debug(`[ResearchCopilot] PDF not indexed (state=${state}), triggering indexing for item ${item.id}...`);
      // @ts-ignore
      await Zotero.Fulltext.indexItems([item.id]);
      // @ts-ignore
      await Zotero.Promise.delay(1000);
    }

    // @ts-ignore
    const cf = Zotero.Fulltext.getItemCacheFile(item);
    if (cf && await IOUtils.exists(cf.path)) {
      // @ts-ignore
      const content = await Zotero.File.getContentsAsync(cf.path);
      const text = typeof content === "string"
        ? content
        : new TextDecoder().decode(content as BufferSource);
      if (text?.trim()) {
        Zotero.debug(`[ResearchCopilot] Extracted ${text.length} chars from PDF item ${item.id}`);
        return text.trim();
      }
    }

    Zotero.debug(`[ResearchCopilot] No text content found in PDF cache for item ${item.id}`);
    return null;
  } catch (e) {
    Zotero.debug(`[ResearchCopilot] Failed to extract PDF text: ${e}`);
    return null;
  }
}

// ---------- PDF binary helpers ----------

/** Convert a Uint8Array / ArrayBuffer to a base64 string. */
export function arrayBufferToBase64(buffer: Uint8Array | ArrayBuffer | any): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Read a file and return its base64-encoded content. */
export async function getFileData(path: string): Promise<string | null> {
  if (typeof IOUtils !== "undefined") {
    try {
      const bytes = await IOUtils.read(path);
      return arrayBufferToBase64(bytes);
    } catch (e) {
      Zotero.debug(`[ResearchCopilot] IOUtils read failed: ${e}`);
    }
  }

  // @ts-ignore — legacy fallback
  if (typeof OS !== "undefined" && OS.File) {
    try {
      // @ts-ignore
      const bytes = await OS.File.read(path);
      return arrayBufferToBase64(bytes);
    } catch (e) {
      Zotero.debug(`[ResearchCopilot] OS.File read failed: ${e}`);
    }
  }

  return null;
}

/**
 * Get a PDF as base64-encoded inline data (for Gemini's inlineData format).
 * Resolves the best PDF attachment if the item is a regular item.
 */
export async function getPdfBase64(item: any): Promise<{ mimeType: string; data: string } | null> {
  const att = item.isAttachment?.() ? item : getBestPdfAttachment(item);
  if (!att) return null;
  const path = await att.getFilePathAsync();
  if (!path) return null;
  try {
    const data = await getFileData(path);
    if (data) return { mimeType: "application/pdf", data };
  } catch (e) {
    Zotero.debug(`[ResearchCopilot] getPdfBase64 failed: ${e}`);
  }
  return null;
}
