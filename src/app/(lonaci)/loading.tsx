import { Skeleton } from "@/components/lonaci/ui/feedback-state";
import { Surface } from "@/components/lonaci/ui/surface";

export default function LonaciLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Surface elevated padding="lg">
        <Skeleton lines={2} />
      </Surface>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Surface key={index} padding="lg">
            <Skeleton lines={4} />
          </Surface>
        ))}
      </div>
    </div>
  );
}
