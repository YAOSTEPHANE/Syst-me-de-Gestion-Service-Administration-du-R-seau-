import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleHelp } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button, IconButton } from "@/components/lonaci/ui/button";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";

describe("primitives accessibles", () => {
  it("expose l'état de chargement et bloque une action en cours", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Enregistrer" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("donne un nom accessible aux actions uniquement graphiques", () => {
    render(<IconButton icon={CircleHelp} label="Aide contextuelle" />);
    expect(screen.getByRole("button", { name: "Aide contextuelle" })).toBeTruthy();
  });

  it("annonce les erreurs et le chargement", () => {
    render(
      <>
        <FeedbackState tone="danger" title="Échec" />
        <Skeleton />
      </>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Chargement en cours" })).toBeTruthy();
  });
});
