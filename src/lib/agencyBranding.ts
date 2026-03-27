/** Client-only keys for itinerary / receipt branding (Settings page). */

export const STORAGE_AGENCY_NAME = "agency_name";
export const STORAGE_AGENCY_LOGO = "agency_logo";
export const STORAGE_AGENCY_PHONE = "agency_phone";
export const STORAGE_AGENCY_ADDRESS = "agency_address";
export const STORAGE_AGENCY_TAGLINE = "agency_tagline";

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

/** Format Postgres `time` / `timetz` strings (e.g. 14:30:00) for itinerary display. */
export function formatTimeForItinerary(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return s;
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, "0")} ${meridiem}`;
}
