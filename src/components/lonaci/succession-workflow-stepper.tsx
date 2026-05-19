"use client";

import {
  SUCCESSION_STEP_DESCRIPTIONS,
  SUCCESSION_STEP_LABELS,
  SUCCESSION_STEPS,
  type SuccessionStep,
} from "@/lib/lonaci/constants";

type Props = {
  stepsCompleted: number;
  currentStepLabel: SuccessionStep | string | null;
  status: "OUVERT" | "CLOTURE";
  className?: string;
};

function stepState(index: number, stepsCompleted: number, status: Props["status"]) {
  if (status === "CLOTURE") return "done" as const;
  if (index < stepsCompleted) return "done" as const;
  if (index === stepsCompleted) return "current" as const;
  return "pending" as const;
}

export default function SuccessionWorkflowStepper({
  stepsCompleted,
  currentStepLabel: _currentStepLabel,
  status,
  className = "",
}: Props) {
  return (
    <ol
      className={`grid gap-2 sm:grid-cols-5 ${className}`}
      aria-label="Workflow succession en 5 étapes (§10.2)"
    >
      {SUCCESSION_STEPS.map((step, index) => {
        const state = stepState(index, stepsCompleted, status);
        return (
          <li
            key={step}
            className={`rounded-xl border px-2.5 py-2 text-[11px] leading-snug ${
              state === "done"
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                : state === "current"
                  ? "border-cyan-400 bg-cyan-50 text-cyan-950 ring-1 ring-cyan-300"
                  : "border-slate-200 bg-slate-50/80 text-slate-600"
            }`}
          >
            <p className="font-semibold">{SUCCESSION_STEP_LABELS[step]}</p>
            <p className="mt-0.5 font-normal opacity-90">{SUCCESSION_STEP_DESCRIPTIONS[step]}</p>
          </li>
        );
      })}
    </ol>
  );
}
