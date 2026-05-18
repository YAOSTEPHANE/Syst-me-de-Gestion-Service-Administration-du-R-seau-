import type { LonaciRole } from "@/lib/lonaci/constants";
import { broadcastCriticalEmailToRole } from "@/lib/lonaci/critical-email";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import { appendMonitoringEvent } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";

export interface CriticalAlertInput {
  code: string;
  title: string;
  message: string;
  roleTarget?: LonaciRole;
  metadata?: Record<string, unknown>;
}

export async function emitCriticalAlert(input: CriticalAlertInput): Promise<void> {
  const roleTarget = input.roleTarget ?? "CHEF_SERVICE";
  const metadata = {
    code: input.code,
    ...(input.metadata ?? {}),
  };

  logger.error(input.title, {
    event: "CRITICAL_ALERT",
    roleTarget,
    ...metadata,
  });

  await Promise.all([
    appendMonitoringEvent({
      code: input.code,
      title: input.title,
      message: input.message,
      roleTarget,
      metadata,
    }),
    notifyRoleTargets(roleTarget, input.title, input.message, metadata),
    broadcastCriticalEmailToRole(roleTarget, `[${input.code}] ${input.title}`, input.message),
  ]);
}

