export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Accès refusé</h1>
        <p className="text-sm text-gray-500">
          Ton compte ne permet pas d&apos;accéder à la console projectionniste.
        </p>
        <a href="/login" className="inline-block text-sm text-blue-600 hover:underline">
          Retour au login
        </a>
      </div>
    </main>
  );
}
