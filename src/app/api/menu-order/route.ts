import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  LONACI_NAV_CATALOG,
  mergeMenuOrder,
  toMenuOrder,
  validateMenuOrder,
} from "@/lib/lonaci/nav-catalog";
import {
  getStoredMenuOrder,
  saveStoredMenuOrder,
  type StoredMenuOrder,
} from "@/lib/lonaci/menu-order-store";

const menuOrderSectionSchema = z
  .object({
    section: z.string().trim().min(1).max(80),
    hrefs: z.array(z.string().trim().min(1).max(200)).max(200),
  })
  .strict();

const patchMenuOrderSchema = z
  .object({
    order: z.array(menuOrderSectionSchema).max(30),
  })
  .strict()
  .superRefine((value, context) => {
    for (const issue of validateMenuOrder(value.order, LONACI_NAV_CATALOG)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["order", ...issue.path],
        message: issue.message,
      });
    }
  });

function menuOrderResponse(stored: StoredMenuOrder) {
  const order = toMenuOrder(mergeMenuOrder(LONACI_NAV_CATALOG, stored.order));
  return NextResponse.json(
    {
      order,
      updatedAt: stored.updatedAt?.toISOString() ?? null,
      updatedByUserId: stored.updatedByUserId,
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { moduleKey: null });
  if ("error" in auth) return auth.error;

  return menuOrderResponse(await getStoredMenuOrder());
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
    moduleKey: null,
  });
  if ("error" in auth) return auth.error;

  const parsed = patchMenuOrderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return zodBadRequest(
      parsed.error,
      "Ordre du menu invalide. Les modules doivent rester dans leur section d'origine.",
    );
  }

  const canonicalOrder = toMenuOrder(
    mergeMenuOrder(LONACI_NAV_CATALOG, parsed.data.order),
  );
  return menuOrderResponse(
    await saveStoredMenuOrder(canonicalOrder, auth.user),
  );
}
