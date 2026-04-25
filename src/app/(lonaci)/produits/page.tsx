import { redirect } from "next/navigation";

/** Ancienne entrée « Produits » : le référentiel produits vit désormais sous Paramètres → Référentiels. */
export default function ProduitsPage() {
  redirect("/parametres?tab=referentiels");
}
