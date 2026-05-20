import { describe, expect, it } from "vitest";
import { REQUIRED_KAYA_OUTPUT_NAMES, validateKayaOutputNames } from "./outputContract";

describe("Kaya ONNX output contract", () => {
  it("requires Kaya's four model output heads", () => {
    expect(REQUIRED_KAYA_OUTPUT_NAMES).toEqual(["policy", "value", "miscvalue", "ownership"]);
  });

  it("accepts sessions that expose all required output names", () => {
    expect(validateKayaOutputNames(["ownership", "policy", "miscvalue", "value"])).toEqual({
      ok: true,
    });
  });

  it("reports missing output names with an actionable message", () => {
    expect(validateKayaOutputNames(["policy", "value", "ownership"])).toEqual({
      ok: false,
      message: "Kaya ONNX artifact is missing required output name(s): miscvalue",
    });
  });
});
