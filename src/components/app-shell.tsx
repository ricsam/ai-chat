import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronUp, LogOut, Moon, Settings, Shield, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useMe, usePublicConfig } from "@/hooks/use-app";
import { signOut } from "@/lib/auth-client";

export function AppShell({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const config = usePublicConfig();
  const { user } = useMe();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  if (user === undefined || !config)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Opening your workspace…
      </div>
    );
  if (!user) {
    void navigate({ to: "/" });
    return null;
  }
  const logout = async () => {
    await signOut();
    window.location.href = "/";
  };
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {sidebar && (
        <aside className="hidden w-[272px] shrink-0 border-r bg-sidebar md:flex md:flex-col">
          {sidebar}
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Link to="/chat" className="flex items-center gap-2.5">
            <BrandMark logo={config.brand.logo} className="size-7 rounded-lg" />
            <span className="font-semibold tracking-tight">
              {config.brand.name}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-7">
                    <AvatarFallback>
                      {user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm sm:inline">{user.name}</span>
                  <ChevronUp className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate">{user.name}</span>
                  <span className="block truncate font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {user.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <Shield />
                      Administration
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function SettingsNav({
  active,
}: {
  active: "providers" | "mcp" | "profile";
}) {
  return (
    <nav className="flex gap-1 rounded-xl border bg-muted/30 p-1">
      <Button
        variant={active === "providers" ? "secondary" : "ghost"}
        size="sm"
        asChild
      >
        <Link to="/settings">Providers & models</Link>
      </Button>
      <Button
        variant={active === "mcp" ? "secondary" : "ghost"}
        size="sm"
        asChild
      >
        <Link to="/settings/mcp">MCP servers</Link>
      </Button>
      <Button
        variant={active === "profile" ? "secondary" : "ghost"}
        size="sm"
        asChild
      >
        <Link to="/settings/profile">Profile</Link>
      </Button>
    </nav>
  );
}

export function SettingsPage({
  title,
  description,
  active,
  children,
}: {
  title: string;
  description: string;
  active: "providers" | "mcp" | "profile";
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <h1 className="font-serif text-4xl tracking-tight">{title}</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {description}
              </p>
            </div>
            <SettingsNav active={active} />
          </div>
          <Separator className="my-8" />
          {children}
        </div>
      </div>
    </AppShell>
  );
}
