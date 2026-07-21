import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "@/components/lonaci/ui/dialog";

function DialogHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Déclencheur</button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onClose();
        }}
        title="Modifier le dossier"
        description="Vérifiez les informations."
        footer={<button type="button">Valider</button>}
      >
        <input aria-label="Référence" data-autofocus />
      </Dialog>
    </>
  );
}

function ControlledDialogHarness() {
  const [value, setValue] = useState("");
  return (
    <Dialog open onOpenChange={() => undefined} title="Créer un client">
      <input
        aria-label="Nom du client"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Dialog>
  );
}

describe("Dialog", () => {
  it("nomme la fenêtre, place le focus et la ferme avec Échap", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);

    const dialog = await screen.findByRole("dialog", { name: "Modifier le dossier" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByLabelText("Référence")).toBe(document.activeElement);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("maintient la tabulation dans la fenêtre", async () => {
    const user = userEvent.setup();
    render(<DialogHarness onClose={() => undefined} />);
    await screen.findByLabelText("Référence");
    const validate = screen.getByRole("button", { name: "Valider" });
    const close = screen.getByRole("button", { name: "Fermer la fenêtre" });

    validate.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);

    close.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(validate);
  });

  it("conserve le focus dans un champ contrôlé pendant la saisie", async () => {
    const user = userEvent.setup();
    render(<ControlledDialogHarness />);
    const input = await screen.findByLabelText("Nom du client");

    await user.click(input);
    await user.type(input, "Client 2026");

    expect((input as HTMLInputElement).value).toBe("Client 2026");
    expect(document.activeElement).toBe(input);
  });
});
