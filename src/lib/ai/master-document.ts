import { readFile } from "node:fs/promises";
import { privateMethodEnv } from "../env";

/**
 * Appends the client's private method to the public master document.
 *
 * @param publicDocument - Text of `docs/documento-mestre.md`.
 * @param privateMethodBase64 - The method as base64 Markdown, or undefined when the server has none.
 * @returns The business rules the model reads.
 *
 * @remarks The private method is the mentor's paid course content. It lives only in the server's
 * environment and is never committed to the public repository.
 */
export function withPrivateMethod(publicDocument: string, privateMethodBase64: string | undefined) {
  if (privateMethodBase64 == null) return publicDocument;
  const privateMethod = Buffer.from(privateMethodBase64, "base64").toString("utf8");
  if (privateMethod.trim() === "") return publicDocument;
  return `${publicDocument}\n\n${privateMethod}`;
}

let master: Promise<string> | undefined;
export function masterDocument() {
  return (master ??= readFile(process.cwd() + "/docs/documento-mestre.md", "utf8")
    .then((publicDocument) =>
      withPrivateMethod(publicDocument, privateMethodEnv().PRIVATE_METHOD_BASE64),
    )
    .catch((error) => {
      master = undefined;
      throw error;
    }));
}
