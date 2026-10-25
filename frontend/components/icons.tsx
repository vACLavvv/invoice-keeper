// Thin line icons (1.5px stroke, 20px box) for the navigation.
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const icons = {
  payments: <Icon><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Icon>,
  recurring: <Icon><path d="M20 12a8 8 0 0 1-13.7 5.6" /><path d="M4 12A8 8 0 0 1 17.7 6.4" /><path d="M18 3v3.5h-3.5" /><path d="M6 21v-3.5h3.5" /></Icon>,
  calendar: <Icon><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>,
  team: <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M18.5 20a6.5 6.5 0 0 0-3-5.5" /></Icon>,
  activity: <Icon><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>,
  docs: <Icon><path d="M6 3.5h11a1 1 0 0 1 1 1V20l-6-3.5L6 20V4.5a1 1 0 0 1 0-1Z" /></Icon>,
  logout: <Icon><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></Icon>,
  inbox: <Icon><path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" /><path d="M3.5 13.5h5l1 2h5l1-2h5" /></Icon>,
  extension: <Icon><path d="M9 4.5a2 2 0 0 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H18v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V20H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H4V7a1 1 0 0 1 1-1h4Z" /></Icon>,
  budget: <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
  help: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17h.01" /></Icon>,
  account: <Icon><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Icon>,
  bell: <Icon><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></Icon>,
};

/** Line icons of the workspace design (main branch): 24px grid, 1.65 stroke. */
function Line({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ws = {
  webhook: <Line><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="m8.6 10.5 6.8-3M8.6 13.5l6.8 3" /></Line>,
  overview: <Line><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></Line>,
  payments: <Line><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M4 10h16M10 10v10" /></Line>,
  history: <Line><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2" /></Line>,
  calendar: <Line><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-11 4h.01M12 15h.01M16 15h.01" /></Line>,
  budget: <Line><path d="M12 3v9h9A9 9 0 1 1 12 3Z" /><path d="M16 3.8A9 9 0 0 1 20.2 8H16Z" /></Line>,
  recurring: <Line><path d="M19 7a8 8 0 0 0-13-1L3 9m0-5v5h5m-3 8a8 8 0 0 0 13 1l3-3m0 5v-5h-5" /></Line>,
  bell: <Line><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4M12 2v2" /></Line>,
  users: <Line><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></Line>,
  activity: <Line><path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01" /></Line>,
  inbox: <Line><path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" /><path d="M3.5 13.5h5l1 2h5l1-2h5" /></Line>,
  extension: <Line><path d="M9 4.5a2 2 0 0 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H18v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V20H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H4V7a1 1 0 0 1 1-1h4Z" /></Line>,
  account: <Line><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Line>,
  help: <Line><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17h.01" /></Line>,
  sun: <Line size={18}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" /></Line>,
  moon: <Line size={18}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></Line>,
  plus: <Line size={18}><path d="M12 5v14M5 12h14" /></Line>,
  search: <Line size={18}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></Line>,
  receipt: <Line size={18}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></Line>,
  check: <Line size={18}><path d="m5 12 4.5 4.5L19 7" /></Line>,
  clock: <Line size={18}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Line>,
};
