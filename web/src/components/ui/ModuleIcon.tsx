type ModuleName = 'panel' | 'tasks' | 'customers' | 'finance' | 'payments' | 'team' | 'audit' | 'profile';

/** Dekoratif simgeler; erişilebilir adı çağıran bağlantının metni taşır. */
export function ModuleIcon({ name }: { name: ModuleName }) {
  const paths = {
    panel: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    tasks: 'M9 5h12 M9 12h12 M9 19h12 M3 5l1 1 2-3 M3 12l1 1 2-3 M3 19l1 1 2-3',
    customers: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M21 21v-2a4 4 0 0 0-3-3.87',
    finance: 'M3 7h18v14H3z M3 7V4h15v3 M16 12h5v5h-5z',
    payments: 'M3 7h17 M16 3l4 4-4 4 M21 17H4 M8 13l-4 4 4 4',
    team: 'M3 21v-3a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3 M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M3 10h2 M19 10h2',
    audit: 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4',
    profile: 'M20 21v-2a7 7 0 0 0-14 0v2 M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
