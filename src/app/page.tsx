import { redirect } from "next/navigation";
/** Entrée applicative: toujours afficher l'écran de connexion. */
export default function Home() {
  redirect("/login");
}
