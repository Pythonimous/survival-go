import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AnalysisRuntimeModelPicker from "./AnalysisRuntimeModelPicker";
import type { OnnxModelLoadSnapshot } from "@/lib/analysis/runtime/loadProgress";
import type { OnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

function snapshot(overrides: Partial<OnnxModelLoadSnapshot> = {}): OnnxModelLoadSnapshot {
  return {
    phase: "idle",
    variant: null,
    modelArtifactUrl: null,
    ...overrides,
  };
}

function pickerProps(overrides: Partial<React.ComponentProps<typeof AnalysisRuntimeModelPicker>> = {}) {
  return {
    variants: ["fp32", "fp16", "uint8"] as readonly OnnxModelVariant[],
    selectedVariant: null,
    recommendedVariant: "fp16" as OnnxModelVariant,
    loadSnapshot: snapshot(),
    capabilityCompatible: true,
    onSelectVariant: vi.fn(),
    ...overrides,
  };
}

describe("AnalysisRuntimeModelPicker", () => {
  it("renders one button per shipped variant", () => {
    render(<AnalysisRuntimeModelPicker {...pickerProps()} />);

    const group = within(screen.getByRole("group", { name: /^model$/i }));
    expect(group.getByRole("button", { name: /full precision \(fp32/i })).toBeInTheDocument();
    expect(group.getByRole("button", { name: /half precision \(fp16/i })).toBeInTheDocument();
    expect(group.getByRole("button", { name: /quantized \(uint8/i })).toBeInTheDocument();
  });

  it("marks the recommended variant with a recommended badge", () => {
    render(<AnalysisRuntimeModelPicker {...pickerProps({ recommendedVariant: "fp16" })} />);

    const fp16Button = screen.getByRole("button", { name: /half precision \(fp16/i });
    expect(within(fp16Button).getByText(/recommended/i)).toBeInTheDocument();
    const fp32Button = screen.getByRole("button", { name: /full precision \(fp32/i });
    expect(within(fp32Button).queryByText(/recommended/i)).not.toBeInTheDocument();
  });

  it("calls onSelectVariant with the picked variant when a button is clicked", async () => {
    const onSelectVariant = vi.fn();
    const user = userEvent.setup();
    render(<AnalysisRuntimeModelPicker {...pickerProps({ onSelectVariant })} />);

    await user.click(screen.getByRole("button", { name: /quantized \(uint8/i }));

    expect(onSelectVariant).toHaveBeenCalledWith("uint8");
  });

  it("marks the selected variant with aria-pressed", () => {
    render(<AnalysisRuntimeModelPicker {...pickerProps({ selectedVariant: "fp16" })} />);

    expect(screen.getByRole("button", { name: /half precision \(fp16/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /full precision \(fp32/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("disables all model buttons while a download or initialization is running", () => {
    render(
      <AnalysisRuntimeModelPicker
        {...pickerProps({
          selectedVariant: "fp16",
          loadSnapshot: snapshot({
            phase: "downloading",
            variant: "fp16",
            modelArtifactUrl: "/models/kaya.fp16.onnx",
          }),
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /half precision \(fp16/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /full precision \(fp32/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /quantized \(uint8/i })).toBeDisabled();
  });

  it("shows an idle status hint before any model is picked", () => {
    render(<AnalysisRuntimeModelPicker {...pickerProps()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /pick a model to download before starting/i,
    );
  });

  it("shows a downloading status while the selected variant is downloading", () => {
    render(
      <AnalysisRuntimeModelPicker
        {...pickerProps({
          selectedVariant: "fp32",
          loadSnapshot: snapshot({
            phase: "downloading",
            variant: "fp32",
            modelArtifactUrl: "/models/kaya.fp32.onnx",
          }),
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/downloading fp32 model/i);
  });

  it("shows a ready status when the selected variant is loaded", () => {
    render(
      <AnalysisRuntimeModelPicker
        {...pickerProps({
          selectedVariant: "fp16",
          loadSnapshot: snapshot({
            phase: "ready",
            variant: "fp16",
            modelArtifactUrl: "/models/kaya.fp16.onnx",
          }),
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/fp16 model ready/i);
  });

  it("shows an error status when model load fails", () => {
    render(
      <AnalysisRuntimeModelPicker
        {...pickerProps({
          selectedVariant: "fp32",
          loadSnapshot: snapshot({
            phase: "error",
            variant: "fp32",
            modelArtifactUrl: "/models/kaya.fp32.onnx",
            errorMessage: "network failure",
          }),
        })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/failed.*network failure/i);
  });

  it("hides the picker buttons when the browser is incompatible", () => {
    render(<AnalysisRuntimeModelPicker {...pickerProps({ capabilityCompatible: false })} />);

    expect(screen.queryByRole("group", { name: /^model$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /on-device analysis is not available/i,
    );
  });
});
