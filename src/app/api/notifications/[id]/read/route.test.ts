import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markNotificationReadMock, requireApiAuthMock } = vi.hoisted(() => ({
  markNotificationReadMock: vi.fn(),
  requireApiAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/notifications", () => ({
  markNotificationRead: markNotificationReadMock,
}));

import { POST } from "./route";

describe("POST /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "user-1" } });
    markNotificationReadMock.mockResolvedValue(true);
  });

  it("utilise le droit de mise à jour des notifications", async () => {
    const request = new NextRequest("http://localhost:3000/api/notifications/notification-1/read", {
      method: "POST",
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "notification-1" }),
    });

    expect(requireApiAuthMock).toHaveBeenCalledWith(request, {
      rbac: { resource: "NOTIFICATIONS", action: "UPDATE" },
    });
    expect(markNotificationReadMock).toHaveBeenCalledWith("notification-1", "user-1");
    expect(response.status).toBe(200);
  });
});
