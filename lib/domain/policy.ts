import type { DirectoryQuery } from "./types";
import { BUSINESS_MODES, FULFILLMENTS } from "./validation";
/** Search-only parsing: repeated/unknown filters are ignored, never used as authorization. */
export function parseDirectoryQuery(input: Readonly<Record<string, string | string[] | undefined>>): DirectoryQuery {
  const text = (value: string | string[] | undefined): string => typeof value === "string"
    ? value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
  return {
    location: text(input.location), category: text(input.category),
    mode: BUSINESS_MODES.find(mode => mode === text(input.mode)) ?? "",
    fulfillment: FULFILLMENTS.find(mode => mode === text(input.fulfillment)) ?? "",
  };
}
