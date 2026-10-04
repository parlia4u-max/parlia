"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";

type MenuItem = {
  label: string;
  href: string;
  icon: string;
  desktopOnly?: boolean;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
  collapsible?: boolean;
};

export type NavigationAccess = {
  isOwner: boolean;
  canViewPeople: boolean;
  canManagePeople: boolean;
  canViewMatters: boolean;
  canViewTasks: boolean;
  canViewCalendar: boolean;
  canViewAttendance: boolean;
  canViewReports: boolean;
  canEditMatters: boolean;
  setupHrefs: string[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "MY DAY",
    items: [
      { label: "Dashboard", href: "/", icon: "home" },
      { label: "My to-do", href: "/tasks", icon: "tasks" },
    ],
  },
  {
    label: "MATTERS",
    items: [
      { label: "Matters", href: "/matters", icon: "matter" },
      { label: "Stages board", href: "/matters/board", icon: "filing" },
      { label: "Calendar", href: "/calendar", icon: "calendar" },
      { label: "Service & tracing", href: "/service-tracing", icon: "service" },
      { label: "Duties", href: "/duties", icon: "filing" },
      { label: "Physical files", href: "/physical-files", icon: "filing" },
      { label: "Reports", href: "/reports", icon: "reports" },
      { label: "Client submissions", href: "/client-review", icon: "messages" },
    ],
  },
  {
    label: "TEAM",
    items: [
      { label: "Team messages", href: "/team/messages", icon: "messages" },
      { label: "Meetings & minutes", href: "/team/meetings", icon: "meetings" },
      { label: "Team suggestions", href: "/team/suggestions", icon: "suggestions" },
      { label: "Employee of the month", href: "/team/recognition", icon: "people" },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { label: "Staff", href: "/staff", icon: "people" },
      { label: "Leave and HR", href: "/leave", icon: "leave" },
      { label: "Clock-in & attendance", href: "/attendance", icon: "clock" },
      { label: "My HR record", href: "/people/hr", icon: "people" },
      { label: "Equipment register", href: "/people/equipment", icon: "equipment" },
      { label: "Password vault", href: "/people/password-vault", icon: "passwords" },
      { label: "Help Center", href: "/help", icon: "messages" },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { label: "Setup Centre", href: "/setup", icon: "setup", desktopOnly: true },
      { label: "Firm profile and branding", href: "/settings/firm-profile", icon: "setup" },
      { label: "Country & holidays", href: "/settings/country-holidays", icon: "calendar" },
      { label: "Matter types & stages", href: "/settings/matter-types-stages", icon: "matter" },
      { label: "Task types & categories", href: "/settings/task-types-categories", icon: "tasks" },
      { label: "Urgency bands", href: "/settings/urgency-bands", icon: "clock" },
      { label: "Follow-up and tracing rules", href: "/settings/follow-up-tracing", icon: "tracing" },
      { label: "Calendar visibility", href: "/settings/calendar-visibility", icon: "calendar" },
      { label: "Leave rules and forms", href: "/settings/leave-rules", icon: "leave" },
      { label: "Minutes templates", href: "/settings/minutes-templates", icon: "meetings" },
      { label: "HR checklist and onboarding", href: "/settings/hr-checklist", icon: "people" },
      { label: "Filing structure", href: "/settings/filing-structure", icon: "filing" },
      { label: "Integrations", href: "/settings/integrations", icon: "setup" },
      { label: "Permissions and role templates", href: "/settings/permissions", icon: "people" },
      { label: "Supervisor setup rights", href: "/settings/supervisor-setup-rights", icon: "people" },
      { label: "Audit log", href: "/settings/audit-log", icon: "reports" },
      { label: "Subscription & team size", href: "/settings/subscription", icon: "setup" },
    ],
  },
];

const allItems = menuGroups.flatMap((group) => group.items);
const mobileItems = [
  allItems.find((item) => item.href === "/"),
  allItems.find((item) => item.href === "/staff"),
].filter((item): item is MenuItem => item !== undefined && !item.desktopOnly);
const mobileShortcutHrefs = new Set(mobileItems.map((item) => item.href));

function ParliaLogo() {
  return (
    <Image
      alt="Parlia — Run your firm together"
      className="parlia-logo"
      height={512}
      priority
      src="/images/parlia-logo-light.png"
      width={768}
    />
  );
}

function MenuIcon({ name }: { name: string }) {
  const common = {
    "aria-hidden": true as const,
    className: "menu-icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  const shapes: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></>,
    matter: <><rect x="3" y="6" width="18" height="15" rx="2" /><path d="M8 6V4h8v2M3 11h18m-11 0v2h4v-2" /></>,
    tasks: <><path d="m5 12 4 4L19 6" /><path d="M20 12v7H4V5h10" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    leave: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M5.5 5.5l2 2" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm13-9a3 3 0 1 0-1-5.8M18 14a5 5 0 0 1 3 4.6V20h-3" /></>,
    duties: <><path d="M4 20V8l8-5 8 5v12H4Z" /><path d="M9 20v-6h6v6M8 9h.01M12 9h.01M16 9h.01" /></>,
    service: <><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" /><path d="m16 16 2 2 3-4" /></>,
    tracing: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 10h5M10.5 7.5v5" /></>,
    filing: <><path d="M3 7h7l2 2h9v11H3z" /><path d="M3 7V5h7l2 2" /></>,
    reports: <><path d="M4 20V4m0 16h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    messages: <><path d="M4 5h16v12H9l-5 4V5Z" /><path d="M8 9h8M8 13h5" /></>,
    meetings: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M8 3v4m8-4v4M3 10h18M8 14h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    equipment: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8m-4-3v3" /></>,
    passwords: <><circle cx="8" cy="12" r="4" /><path d="m11 15 8 0m-2 0v3m-3-3v2" /></>,
    locations: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    suggestions: <><path d="M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.7c.5.4 1 1 1 1.8h6c0-.8.5-1.4 1-1.8A7 7 0 0 0 12 2Z" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    setup: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9L16 21h-3l-.3-2.2a8 8 0 0 1-1.6-.9l-1.7.7L8 16.2l1.4-1.1A7 7 0 0 1 9.2 13L7 12.3v-2.8l2.2-.4a8 8 0 0 1 .8-1.8L8.8 5.8l1.5-2.4 1.7.7a8 8 0 0 1 1.8-.2l.7-1.9h2.8l.4 2.1a8 8 0 0 1 1.6.9l1.7-.7 1.5 2.4-1.5 1.3a8 8 0 0 1 .1 1.8l2 .8v2.8l-2.1.5a8 8 0 0 1-.6 1.1Z" transform="translate(-1 -1) scale(.92)" /></>,
  };

  return <svg {...common}>{shapes[name] ?? shapes.home}</svg>;
}

function isActive(pathname: string, href: string) {
  if (href === "/matters") return pathname === href || pathname.startsWith("/matters/") && !pathname.startsWith("/matters/board");
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveGroup(pathname: string) {
  return menuGroups.find((group) =>
    group.items.some((item) => isActive(pathname, item.href)),
  )?.label ?? "MY DAY";
}

export function AppShell({ children, navigationAccess }: { children: React.ReactNode; navigationAccess: NavigationAccess }) {
  const pathname = usePathname();
  const [textSize, setTextSize] = useState("normal");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(() => getActiveGroup(pathname));
  const visibleMenuGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.href === "/staff") return navigationAccess.canViewPeople;
        if (item.href === "/leave" || item.href === "/people/hr") return navigationAccess.canViewPeople;
        if (item.href === "/people/equipment") return navigationAccess.canManagePeople;
        if (item.href === "/people/password-vault") return navigationAccess.isOwner;
        if (item.href.startsWith("/team/")) return navigationAccess.canViewPeople;
        if (item.href === "/matters" || item.href === "/matters/board") return navigationAccess.canViewMatters;
        if (item.href === "/tasks") return navigationAccess.canViewTasks;
        if (item.href === "/calendar") return navigationAccess.canViewCalendar;
        if (item.href === "/attendance") return navigationAccess.canViewAttendance;
        if (item.href === "/reports") return navigationAccess.canViewReports;
        if (item.href === "/client-review") return navigationAccess.canEditMatters;
        if (item.href === "/service-tracing" || item.href === "/duties" || item.href === "/physical-files") return navigationAccess.canViewMatters;
        if (item.href === "/setup") return navigationAccess.isOwner || navigationAccess.setupHrefs.length > 0;
        if (item.href === "/settings/audit-log" || item.href === "/settings/subscription" ||
          item.href === "/settings/permissions" || item.href === "/settings/integrations" ||
          item.href === "/settings/supervisor-setup-rights") return navigationAccess.isOwner;
        if (item.href.startsWith("/settings/")) return navigationAccess.isOwner || navigationAccess.setupHrefs.includes(item.href);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
  const visibleMobileItems = visibleMenuGroups.flatMap((group) => group.items)
    .filter((item) => mobileShortcutHrefs.has(item.href));

  useEffect(() => {
    const savedSize = window.localStorage.getItem("parlia-text-size");
    if (savedSize === "large" || savedSize === "extra-large" || savedSize === "normal") {
      setTextSize(savedSize);
    }
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }
    document.documentElement.dataset.textSize = textSize;
    window.localStorage.setItem("parlia-text-size", textSize);
  }, [preferencesLoaded, textSize]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenGroup(getActiveGroup(pathname));
  }, [pathname]);

  const publicRoutes = ["/login", "/get-started", "/owner-account", "/accept-invitation", "/forgot-password", "/reset-password"];
  if (publicRoutes.includes(pathname) || pathname === "/client" || pathname.startsWith("/client/")) {
    return (
      <div className="public-shell">
        <Link className="public-brand" href="/" aria-label="Parlia home">
          <ParliaLogo />
        </Link>
        {children}
      </div>
    );
  }

  const renderLink = (item: MenuItem, mobile = false) => (
    <Link
      key={item.href}
      className={`nav-link${isActive(pathname, item.href) ? " is-active" : ""}${mobile ? " mobile-nav-link" : ""}`}
      href={item.href}
      aria-current={isActive(pathname, item.href) ? "page" : undefined}
      onClick={() => setMobileMenuOpen(false)}
    >
      <MenuIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className="app-layout">
      <aside className="sidebar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Parlia home">
          <ParliaLogo />
        </Link>
        <nav className="sidebar-nav">
          {visibleMenuGroups.map((group) => group.collapsible === false ? (
            <div className="nav-group nav-group-single" key={group.label}>
              {group.items.map((item) => renderLink(item))}
            </div>
          ) : (
            <section className="nav-group" key={group.label}>
              <button
                aria-controls={`nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}
                aria-expanded={openGroup === group.label}
                className="nav-group-toggle"
                onClick={() => setOpenGroup((current) => current === group.label ? "" : group.label)}
                type="button"
              >
                <span>{group.label}</span>
                <span aria-hidden="true" className={`nav-chevron${openGroup === group.label ? " is-open" : ""}`} />
              </button>
              {openGroup === group.label && (
                <div className="nav-group-items" id={`nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
                  {group.items.map((item) => renderLink(item))}
                </div>
              )}
            </section>
          ))}
        </nav>
        <p className="sidebar-footer">Run your firm together.</p>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <Link className="mobile-logo-link" href="/" aria-label="Parlia home">
              <ParliaLogo />
            </Link>
          </div>
          <div className="topbar-spacer" />
          <form action={logout} className="topbar-signout">
            <button className="button-secondary" type="submit">Sign out</button>
          </form>
          <label className="text-size-control">
            <span>Text size</span>
            <select
              aria-label="Text size"
              value={textSize}
              onChange={(event) => setTextSize(event.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra large</option>
            </select>
          </label>
        </header>
        <main className="page-content">{children}</main>
      </div>

      <nav className="mobile-bar" aria-label="Mobile navigation">
        {visibleMobileItems.map((item) => renderLink(item, true))}
        <button
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          className={`nav-link mobile-nav-link mobile-menu-button${mobileMenuOpen ? " is-active" : ""}`}
          onClick={() => setMobileMenuOpen((open) => !open)}
          type="button"
        >
          <span className="menu-dots" aria-hidden="true">•••</span>
          <span>More</span>
        </button>
      </nav>
      {mobileMenuOpen && (
        <div className="mobile-menu-panel">
          {visibleMenuGroups.map((group) => {
            const items = group.items.filter((item) => !mobileShortcutHrefs.has(item.href) && !item.desktopOnly);
            if (items.length === 0) {
              return null;
            }

            return (
              <section className="nav-group mobile-nav-group" key={group.label}>
                <button
                  aria-controls={`mobile-nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}
                  aria-expanded={openGroup === group.label}
                  className="nav-group-toggle"
                  onClick={() => setOpenGroup((current) => current === group.label ? "" : group.label)}
                  type="button"
                >
                  <span>{group.label}</span>
                  <span aria-hidden="true" className={`nav-chevron${openGroup === group.label ? " is-open" : ""}`} />
                </button>
                {openGroup === group.label && (
                  <div className="nav-group-items" id={`mobile-nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
                    {items.map((item) => renderLink(item, true))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
