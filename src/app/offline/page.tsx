export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Mode hors connexion</h1>
      <p className="mt-3 text-sm text-slate-600">
        Vous etes hors ligne. Les ecrans deja visites restent consultables. Reconnectez-vous pour
        synchroniser les actions serveur.
      </p>
    </main>
  );
}
