import { httpError } from "./auth.js";

export async function readJsonObject(req) {
  const chunks = [];
  let length = 0;
  if (Number(req.headers["content-length"]) > 16384)
    throw httpError(413, "Request too large", "BODY_TOO_LARGE");
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384)
      throw httpError(413, "Request too large", "BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON body", "INVALID_JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw httpError(400, "Expected JSON object", "INVALID_JSON");
  return value;
}
