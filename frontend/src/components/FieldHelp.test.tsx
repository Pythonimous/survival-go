import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import FieldHelp from "./FieldHelp";

describe("FieldHelp", () => {
  it("shows a short hint by default", () => {
    render(
      <FieldHelp
        fieldName="Max visits"
        hint="Short hint text."
        detail="Longer explanation for the dialog."
      />,
    );

    expect(screen.getByText("Short hint text.")).toBeInTheDocument();
    expect(screen.queryByText("Longer explanation for the dialog.")).not.toBeInTheDocument();
  });

  it("opens detail in a dialog when the help button is pressed", async () => {
    const user = userEvent.setup();
    render(
      <FieldHelp
        fieldName="Max visits"
        hint="Short hint text."
        detail="Longer explanation for the dialog."
      />,
    );

    await user.click(screen.getByRole("button", { name: /more information about max visits/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Max visits")).toBeInTheDocument();
    expect(within(dialog).getByText("Longer explanation for the dialog.")).toBeInTheDocument();
  });

  it("closes the dialog from the dismiss button", async () => {
    const user = userEvent.setup();
    render(
      <FieldHelp
        fieldName="Randomness"
        hint="Short hint."
        detail="Detail text."
      />,
    );

    await user.click(screen.getByRole("button", { name: /more information about randomness/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
