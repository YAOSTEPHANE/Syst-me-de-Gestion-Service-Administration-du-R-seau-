/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DocumentsAFournirChecklist from "@/components/lonaci/documents-a-fournir-checklist";
import { ChecklistEditor } from "@/components/lonaci/workflow/checklist-editor";

const STATUTS = ["FOURNI", "MANQUANT", "EN_ATTENTE"] as const;
const LABELS = {
  FOURNI: "Fourni",
  MANQUANT: "Manquant",
  EN_ATTENTE: "En attente",
} as const;

describe("ChecklistEditor (mode checkbox)", () => {
  it("affiche des cases à cocher et bascule FOURNI / EN_ATTENTE", () => {
    const onStatusChange = vi.fn();
    render(
      <ChecklistEditor
        title="Documents à fournir"
        entries={[
          {
            itemId: "piece_1",
            libelle: "Acte de décès",
            obligatoire: true,
            statut: "EN_ATTENTE",
          },
        ]}
        statuses={[...STATUTS]}
        statusLabels={LABELS}
        statusTone={(s) => (s === "FOURNI" ? "success" : s === "MANQUANT" ? "danger" : "warning")}
        localStatuses={{ piece_1: "EN_ATTENTE" }}
        progress={{ complet: false, obligatoiresFournis: 0, obligatoiresTotal: 1 }}
        editable
        saving={false}
        onStatusChange={onStatusChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /Acte de décès/i });
    expect(checkbox).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(checkbox);
    expect(onStatusChange).toHaveBeenCalledWith("piece_1", "FOURNI");
  });
});

describe("DocumentsAFournirChecklist", () => {
  it("affiche une liste à cocher interactive", () => {
    render(
      <DocumentsAFournirChecklist
        items={[
          { id: "a", libelle: "Pièce A", obligatoire: true },
          { id: "b", libelle: "Pièce B", obligatoire: false },
        ]}
      />,
    );

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(screen.getByText("Documents à fournir")).toBeTruthy();

    fireEvent.click(boxes[0]!);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/1\/1 coché/)).toBeTruthy();
  });
});
