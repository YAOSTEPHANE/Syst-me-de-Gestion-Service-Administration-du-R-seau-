import { Suspense } from "react";

import CartePdvPanel from "@/components/lonaci/carte-pdv-panel";

export default function CartePdvPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-white/10 bg-[#0f2035]/80 p-6 text-sm text-white">
          Chargement carte PDV...
        </section>
      }
    >
      <CartePdvPanel />
    </Suspense>
  );
}
