export function matchesHRDocumentMagic(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") return bytes.length >= 5 && Buffer.from(bytes).subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/png") return bytes.length >= 8 && Buffer.from(bytes).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return false;
}
