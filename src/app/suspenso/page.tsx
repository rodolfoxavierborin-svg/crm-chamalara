import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sistema Indisponível',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SuspensoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-slate-900">
          Acesso suspenso
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Sistema temporariamente indisponível, entre em contato com o suporte.
        </p>
      </div>
    </main>
  );
}
