import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardNotifications from "@/components/lonaci/dashboard-notifications";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifications du tableau de bord", () => {
  it("charge uniquement les non lues et retire une notification après lecture", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "notification-1",
              title: "Dossier à traiter",
              message: "Une action est requise.",
              channel: "IN_APP",
              readAt: null,
              createdAt: "2026-07-21T12:00:00.000Z",
            },
          ],
          total: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<DashboardNotifications />);

    expect(await screen.findByText("Dossier à traiter")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/notifications?page=1&pageSize=12&unreadOnly=true",
      expect.any(Object),
    );

    await user.click(screen.getByRole("button", { name: "Marquer lu" }));

    await waitFor(() => {
      expect(screen.queryByText("Dossier à traiter")).toBeNull();
    });
    expect(screen.getByText("Aucune notification")).toBeTruthy();
  });
});
