import assert from "node:assert/strict";
import test from "node:test";
import { validatedDocumentReference } from "../lib/client-portal-rules.ts";

test("client submissions accept credential-free HTTPS references only", () => {
  assert.equal(validatedDocumentReference("https://documents.example.org/folder/a").toString(), "https://documents.example.org/folder/a");
  assert.throws(() => validatedDocumentReference("http://documents.example.org/a"), /HTTPS/);
  assert.throws(() => validatedDocumentReference("javascript:alert(1)"), /HTTPS/);
  assert.throws(() => validatedDocumentReference("https://user:pass@example.org/a"), /HTTPS/);
  assert.throws(() => validatedDocumentReference("not a URL"), /HTTPS/);
});
