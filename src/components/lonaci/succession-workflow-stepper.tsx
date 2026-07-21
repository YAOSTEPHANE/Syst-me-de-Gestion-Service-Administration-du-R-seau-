"use client";

import {
  SUCCESSION_STEP_DESCRIPTIONS,
  SUCCESSION_STEP_LABELS,
  SUCCESSION_STEPS,
  type SuccessionStep,
} from "@/lib/lonaci/constants";
import { Check, Clock3 } from "lucide-react";

type Props = {
  stepsCompleted: number;
  currentStepLabel: SuccessionStep | string | null;
  status: "OUVERT" | "CLOTURE";
  className?: string;
};

function stepState(
  index: number,
  stepsCompleted: number,
  currentStepLabel: Props["currentStepLabel"],
  status: Props["status"],
) {
  if (status === "CLOTURE") return "done" as const;
  const currentIndex = currentStepLabel
    ? SUCCESSION_STEPS.findIndex((step) => step === currentStepLabel)
    : -1;
  if (currentIndex >= 0) {
    if (index < currentIndex) return "done" as const;
    if (index === currentIndex) return "current" as const;
    return "pending" as const;
  }
  if (index < stepsCompleted) return "done" as const;
  if (index === stepsCompleted) return "current" as const;
  return "pending" as const;
}

export default function SuccessionWorkflowStepper({
  stepsCompleted,
  currentStepLabel,
  status,
  className = "",
}: Props) {
  return (
    <ol
      className={`relative grid gap-3 sm:grid-cols-5 ${className}`}
      aria-label="Workflow succession en 5 étapes"
    >
      {SUCCESSION_STEPS.map((step, index) => {
        const state = stepState(index, stepsCompleted, currentStepLabel, status);
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={`relative rounded-2xl border px-3 py-3 text-xs leading-snug shadow-sm ${
              state === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : state === "current"
                  ? "border-orange-400 bg-orange-50 text-orange-950 ring-2 ring-orange-200"
                  : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                state === "done" ? "bg-emerald-600 text-white" : state === "current" ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {state === "done" ? <Check className="h-4 w-4" aria-hidden="true" /> : state === "current" ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : index + 1}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider">Étape {index + 17}</span>
            </div>
            <p className="font-semibold">{SUCCESSION_STEP_LABELS[step]}</p>
            <p className="mt-1 font-normal opacity-90">{SUCCESSION_STEP_DESCRIPTIONS[step]}</p>
          </li>
        );
      })}
    </ol>
  );
}
