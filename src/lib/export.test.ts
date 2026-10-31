import { describe, expect, it } from "vitest";
import { creativeText } from "./export";

const item = {
  creativeKey: "L01-C01",
  ideia: "Ideia",
  formato: "Narrador",
  referencia: "",
  instrucoesGravacao: "",
  instrucoesEdicao: "",
  g1: "Gancho 1",
  g2: "Gancho 2",
  g3: "Gancho 3",
  g4: "Gancho 4",
  corpo: "Corpo",
} as Parameters<typeof creativeText>[0];

describe("creative text", () => {
  it("lists the four hooks of a script", () => {
    const text = creativeText(item);

    expect(text).toContain("G1: Gancho 1\nG2: Gancho 2\nG3: Gancho 3\nG4: Gancho 4\n");
  });

  it("lists three hooks for a script generated before the fourth hook existed", () => {
    const text = creativeText({ ...item, g4: null });

    expect(text).toContain("G3: Gancho 3\n\nCORPO");
    expect(text).not.toContain("G4");
  });
});
