import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppFooter from "@/features/app/AppFooter";

vi.mock("@/config/site", () => ({
  GITHUB_REPO_URL: "https://github.com/example/survival-go",
  FEEDBACK_URL: "https://github.com/example/survival-go/issues/new",
}));

describe("AppFooter", () => {
  it("explains that inference runs in the user's browser", () => {
    render(<AppFooter />);

    expect(
      screen.getByText(/inference runs in your browser on your device/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not on the game server/i)).toBeInTheDocument();
  });

  it("shows the application version label", () => {
    render(<AppFooter />);

    expect(screen.getByText(/^v\d+\.\d+\.\d+-beta\.\d+/)).toBeInTheDocument();
  });

  it("links to the repository and feedback channel", () => {
    render(<AppFooter />);

    const sourceLink = screen.getByRole("link", { name: /source on github/i });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://github.com/example/survival-go",
    );
    expect(sourceLink).toHaveAttribute("target", "_blank");

    const feedbackLink = screen.getByRole("link", { name: /send feedback/i });
    expect(feedbackLink).toHaveAttribute(
      "href",
      "https://github.com/example/survival-go/issues/new",
    );
    expect(feedbackLink).toHaveAttribute("target", "_blank");
  });
});
