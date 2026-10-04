import { ActionError } from "./errors.ts";

export function validatedDocumentReference(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ActionError("Enter a complete HTTPS link to the document in the firm’s own system."); }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) {
    throw new ActionError("Document references must be HTTPS links with no embedded username or password.");
  }
  return url.toString();
}
