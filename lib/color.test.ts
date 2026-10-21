import { expect, it } from "vitest";
import { readableOn } from "@/lib/color";

it("escolhe texto legível sobre a cor da empresa", () => {
  expect(readableOn("#F5A400")).toBe("#1e160c");
  expect(readableOn("#1F3A93")).toBe("#ffffff");
});
