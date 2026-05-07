import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { Database, Home, LogOut, User, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';

interface RouterContext {
  queryClient: QueryClient;
  auth: ReturnType<typeof useAuth>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => {
    const auth = useAuth();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const menuContainerRef = useRef<HTMLDivElement | null>(null);
    const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
    const firstMenuItemRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      if (!isUserMenuOpen) return;

      firstMenuItemRef.current?.focus();

      const closeMenu = () => {
        setIsUserMenuOpen(false);
        menuTriggerRef.current?.focus();
      };
      const handlePointerDown = (event: PointerEvent) => {
        if (!menuContainerRef.current?.contains(event.target as Node)) {
          closeMenu();
        }
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu();
        }
      };

      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isUserMenuOpen]);

    return (
      <div className="min-h-screen bg-background">
        <nav className="flex items-center gap-6 border-b border-border px-6 py-3 bg-card/50 backdrop-blur-md sticky top-0 z-50">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="bg-primary p-1.5 rounded-lg">
              <Home className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">composia-ai</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/history"
              className="inline-flex h-ui items-center gap-2 rounded-md px-ui-button text-sm font-medium hover:bg-secondary hover:text-secondary-foreground"
            >
              <WandSparkles className="h-4 w-4" />
              UIDesign
            </Link>
            <Link
              to="/dbdesign"
              className="inline-flex h-ui items-center gap-2 rounded-md px-ui-button text-sm font-medium hover:bg-secondary hover:text-secondary-foreground"
            >
              <Database className="h-4 w-4" />
              DBDesign
            </Link>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-4">
            {auth.user ? (
              <div className="relative" ref={menuContainerRef}>
                <button
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`User menu for ${auth.user.email}`}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:border-primary/50"
                  onClick={() => setIsUserMenuOpen((value) => !value)}
                  ref={menuTriggerRef}
                  type="button"
                >
                  {auth.user.email[0].toUpperCase()}
                </button>
                {isUserMenuOpen ? (
                  <div
                    className="absolute right-0 mt-2 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    role="menu"
                  >
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => setIsUserMenuOpen(false)}
                      ref={firstMenuItemRef}
                      role="menuitem"
                      type="button"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        auth.logout();
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Login
              </Link>
            )}
          </div>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    );
  },
});
