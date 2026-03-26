import Link from "next/link";

export default function LonaciComingSoon({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-[#07111e] px-6 py-10 text-white">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-white/80">Module en cours de déploiement dans l&apos;application.</p>
      <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-[#fcd34d] hover:text-[#fbbf24]">
        ← Tableau de bord
      </Link>
    </div>
  );
}
