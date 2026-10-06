import { Badge } from "@/components/lonaci/ui/badge";
import {
  areWorkflowApprovalsEnabled,
  workflowApprovalsModeDescription,
  workflowApprovalsModeLabel,
} from "@/lib/lonaci/workflow-approvals";
import { GitBranch } from "lucide-react";

/** Bandeau informatif du mode de validation (Paramètres / supervision). */
export default function WorkflowModeBanner() {
  const hierarchical = areWorkflowApprovalsEnabled();
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${
        hierarchical
          ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
          : "border-amber-200 bg-amber-50/80 text-amber-950"
      }`}
      role="status"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
            hierarchical ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
          }`}
        >
          <GitBranch size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">
            Circuit de validation — mode {workflowApprovalsModeLabel().toLowerCase()}
          </p>
          <p className="mt-1 text-xs leading-5 opacity-90">{workflowApprovalsModeDescription()}</p>
        </div>
      </div>
      <Badge tone={hierarchical ? "success" : "warning"} className="w-fit shrink-0">
        {workflowApprovalsModeLabel()}
      </Badge>
    </div>
  );
}
