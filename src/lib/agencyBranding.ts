/** Client-only keys for itinerary / receipt branding (Settings page). */

export const STORAGE_AGENCY_NAME = "agency_name";
export const STORAGE_AGENCY_LOGO = "agency_logo";
export const STORAGE_AGENCY_PHONE = "agency_phone";
export const STORAGE_AGENCY_ADDRESS = "agency_address";
export const STORAGE_AGENCY_TAGLINE = "agency_tagline";

/** Target max serialized size (~450k chars) so one key stays under typical localStorage quota with other data. */
const LOGO_DATA_URL_MAX_CHARS = 450_000;
/** Max edge length after resize; reduced automatically if the JPEG is still too large. */
const LOGO_MAX_SIDE_INITIAL = 480;
const LOGO_MAX_SIDE_MIN = 128;

/**
 * Downscale and re-encode as JPEG so the result fits in localStorage (full PNG/JPEG data URLs often exceed quota).
 * White background is used so transparent PNGs look correct on light UI.
 */
export async function compressImageFileForAgencyLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read this image."));
      img.src = url;
    });

    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("Invalid image dimensions.");

    let maxSide = LOGO_MAX_SIDE_INITIAL;
    let quality = 0.82;

    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare image.");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= LOGO_DATA_URL_MAX_CHARS) {
        return dataUrl;
      }
      maxSide = Math.max(LOGO_MAX_SIDE_MIN, Math.floor(maxSide * 0.72));
      quality = Math.max(0.55, quality - 0.06);
    }

    throw new Error("Could not compress image small enough for browser storage.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function tryPersistAgencyLogo(dataUrl: string): { ok: true } | { ok: false; reason: "quota" | "unknown"; message: string } {
  if (typeof window === "undefined") return { ok: false, reason: "unknown", message: "Not in browser." };
  try {
    window.localStorage.setItem(STORAGE_AGENCY_LOGO, dataUrl);
    return { ok: true };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      return {
        ok: false,
        reason: "quota",
        message: "Browser storage is full or this image is still too large. Try a smaller image or clear site data.",
      };
    }
    const msg = e instanceof Error ? e.message : "Could not save logo.";
    return { ok: false, reason: "unknown", message: msg };
  }
}

export type AgencyBranding = {
  name: string;
  logoDataUrl: string | null;
  phone: string;
  address: string;
  tagline: string;
};

export function readAgencyBrandingFromStorage(): AgencyBranding {
  if (typeof window === "undefined") {
    return {
      name: "GARASHO Travel",
      logoDataUrl: null,
      phone: "",
      address: "",
      tagline: "Your journey, expertly arranged.",
    };
  }
  return {
    name: window.localStorage.getItem(STORAGE_AGENCY_NAME)?.trim() || "GARASHO Travel",
    logoDataUrl: window.localStorage.getItem(STORAGE_AGENCY_LOGO),
    phone: window.localStorage.getItem(STORAGE_AGENCY_PHONE)?.trim() || "",
    address: window.localStorage.getItem(STORAGE_AGENCY_ADDRESS)?.trim() || "",
    tagline: window.localStorage.getItem(STORAGE_AGENCY_TAGLINE)?.trim() || "Your journey, expertly arranged.",
  };
}

/**
 * Extract a clock value Supabase may return as `14:30:00`, ISO `1970-01-01T14:30:00+00:00`,
 * or `2026-03-28T14:30:00`.
 */
export function normalizeTimeStringFromDb(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const isoDateTime = s.match(
    /^\d{4}-\d{2}-\d{2}T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (isoDateTime) {
    const h = isoDateTime[1];
    const m = isoDateTime[2];
    const sec = isoDateTime[3] ?? "00";
    return `${h.padStart(2, "0")}:${m}:${sec.padStart(2, "0")}`;
  }
  const tPart = s.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tPart) {
    return `${tPart[1].padStart(2, "0")}:${tPart[2]}:${(tPart[3] ?? "00").padStart(2, "0")}`;
  }
  const clock = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (clock) {
    return `${clock[1].padStart(2, "0")}:${clock[2]}:${(clock[3] ?? "00").padStart(2, "0")}`;
  }
  return null;
}

/** Format Postgres `time` / ISO time for itinerary display. */
export function formatTimeForItinerary(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const norm = normalizeTimeStringFromDb(raw);
  if (!norm) return "—";
  const m = norm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return String(raw).trim();
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return String(raw).trim();
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, "0")} ${meridiem}`;
}

/** For ticket / booking forms (12h strings). */
export function formatDbTimeTo12h(raw: unknown): string {
  const norm = normalizeTimeStringFromDb(raw);
  if (!norm) return "";
  const m = norm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, "0")} ${meridiem}`;
}
