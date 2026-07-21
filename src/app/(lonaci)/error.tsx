"use client";

import { useEffect } from "react";

import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { Surface } from "@/components/lonaci/ui/surface";

export default function LonaciError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[lonaci-route-error]", error);
  }, [error]);

  return (
    <Surface elevated padding="lg">
      <FeedbackState
        tone="danger"
        title="Cette page n’a pas pu être chargée"
        description="Une erreur inattendue est survenue. Vous pouvez relancer le chargement sans quitter votre espace."
        action={<Button onClick={reset}>Réessayer</Button>}
      />
    </Surface>
  );
}
