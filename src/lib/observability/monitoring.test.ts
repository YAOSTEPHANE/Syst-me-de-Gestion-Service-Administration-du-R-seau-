import { beforeEach, describe, expect, it, vi } from "vitest";

const { broadcastCriticalEmailToRoleMock, notifyRoleTargetsMock, appendMonitoringEventMock, loggerErrorMock } =
  vi.hoisted(() => ({
  broadcastCriticalEmailToRoleMock: vi.fn(),
  notifyRoleTargetsMock: vi.fn(),
  appendMonitoringEventMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  }));

vi.mock("@/lib/lonaci/critical-email", () => ({
  broadcastCriticalEmailToRole: broadcastCriticalEmailToRoleMock,
}));

vi.mock("@/lib/lonaci/notifications", () => ({
  notifyRoleTargets: notifyRoleTargetsMock,
}));

vi.mock("@/lib/observability/events", () => ({
  appendMonitoringEvent: appendMonitoringEventMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

import { emitCriticalAlert } from "./monitoring";

describe("emitCriticalAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broadcastCriticalEmailToRoleMock.mockResolvedValue(undefined);
    notifyRoleTargetsMock.mockResolvedValue(undefined);
    appendMonitoringEventMock.mockResolvedValue(undefined);
  });

  it("journalise et envoie les alertes au role par défaut", async () => {
    await emitCriticalAlert({
      code: "X1",
      title: "Titre",
      message: "Message",
    });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Titre",
      expect.objectContaining({ event: "CRITICAL_ALERT", code: "X1", roleTarget: "CHEF_SERVICE" }),
    );
    expect(notifyRoleTargetsMock).toHaveBeenCalledWith(
      "CHEF_SERVICE",
      "Titre",
      "Message",
      expect.objectContaining({ code: "X1" }),
    );
    expect(appendMonitoringEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "X1",
        title: "Titre",
        message: "Message",
        roleTarget: "CHEF_SERVICE",
      }),
    );
    expect(broadcastCriticalEmailToRoleMock).toHaveBeenCalledWith(
      "CHEF_SERVICE",
      "[X1] Titre",
      "Message",
    );
  });
});

