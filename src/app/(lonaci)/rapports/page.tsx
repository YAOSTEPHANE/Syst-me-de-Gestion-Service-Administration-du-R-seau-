import AdminEmailSettings from "@/components/lonaci/admin-email-settings";
import ReportsPanel from "@/components/lonaci/reports-panel";

export default function RapportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <ReportsPanel />
      <AdminEmailSettings />
    </div>
  );
}
