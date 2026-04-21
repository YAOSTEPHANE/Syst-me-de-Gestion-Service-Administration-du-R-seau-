import type { NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import type { RbacAction, RbacResource } from "@/lib/auth/rbac";
import type { LonaciRole } from "@/lib/lonaci/constants";

interface CheckPermissionOptions {
  roles?: LonaciRole[];
  resource: RbacResource;
  action: RbacAction;
  agenceId?: string;
  produitCode?: string;
}

export async function checkPermission(request: NextRequest, options: CheckPermissionOptions) {
  return requireApiAuth(request, {
    roles: options.roles,
    agenceId: options.agenceId,
    produitCode: options.produitCode,
    rbac: {
      resource: options.resource,
      action: options.action,
    },
  });
}

export function resolveRbacAction<T extends string>(
  target: T,
  mapping: Partial<Record<T, RbacAction>>,
  fallback: RbacAction = "UPDATE",
): RbacAction {
  return mapping[target] ?? fallback;
}

