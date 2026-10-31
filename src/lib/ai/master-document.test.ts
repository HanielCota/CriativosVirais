import { describe, expect, it } from "vitest";
import { withPrivateMethod } from "./master-document";

const encoded = (text: string) => Buffer.from(text, "utf8").toString("base64");

describe("master document", () => {
  it("appends the decoded private method after the public document", () => {
    const document = withPrivateMethod("public rules", encoded("método privado"));

    expect(document).toBe("public rules\n\nmétodo privado");
  });

  it("uses the public document alone when the server has no private method", () => {
    const document = withPrivateMethod("public rules", undefined);

    expect(document).toBe("public rules");
  });

  it("uses the public document alone when the private method is only blank lines", () => {
    const document = withPrivateMethod("public rules", encoded("\n  \n"));

    expect(document).toBe("public rules");
  });
});
