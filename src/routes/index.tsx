import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, loadPublicConfig, type PublicConfig } from "@/lib/api";
import { signIn } from "@/lib/auth-client";

export const Route = createFileRoute("/")({ component: Entry });

function Entry() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig>();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    claimToken: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      loadPublicConfig(),
      api("/api/me").catch(() => null),
    ]).then(([next, me]) => {
      setConfig(next);
      if (me) void navigate({ to: "/chat" });
    });
  }, [navigate]);
  if (!config)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Preparing your workspace…
      </div>
    );
  const setup = config.setup.required;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (setup) {
        if (form.password !== form.confirm)
          throw new Error("Passwords do not match");
        await api("/api/setup", { method: "POST", body: JSON.stringify(form) });
      } else {
        const result = await signIn.email({
          email: form.email,
          password: form.password,
        });
        if (result.error)
          throw new Error(result.error.message || "Sign in failed");
      }
      window.location.href = "/chat";
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Something went wrong",
      );
      setBusy(false);
    }
  };

  const signInOidc = async () => {
    setError("");
    const result = await signIn.oauth2({
      providerId: config.auth.providerKey,
      callbackURL: "/chat",
    });
    if (result.error) setError(result.error.message || "Single sign-on failed");
  };

  return (
    <main className="paper-grid relative grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_.95fr]">
      <div className="absolute inset-0 bg-gradient-to-br from-background/50 via-background/90 to-background" />
      <section className="relative hidden flex-col justify-between p-12 lg:flex xl:p-20">
        <div className="flex items-center gap-3">
          <BrandMark logo={config.brand.logo} />
          <span className="font-semibold tracking-tight">
            {config.brand.name}
          </span>
        </div>
        <div className="max-w-xl">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border bg-card/80 shadow-sm">
            <Sparkles className="size-5 text-primary" />
          </div>
          <h1 className="font-serif text-5xl leading-[1.08] tracking-[-.035em] xl:text-6xl">
            A quieter place for your best thinking.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
            {config.brand.tagline}. Your conversations, models, and tools stay
            in one private workspace.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Private by design · Bring your own model access
        </p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center p-5 sm:p-10">
        <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-xl shadow-foreground/[.04] backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-5">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandMark logo={config.brand.logo} />
              <span className="font-semibold">{config.brand.name}</span>
            </div>
            <div>
              <CardTitle className="font-serif text-3xl tracking-tight">
                {setup ? "Claim your workspace" : "Welcome back"}
              </CardTitle>
              <CardDescription className="mt-2 leading-relaxed">
                {setup
                  ? "Create the first administrator account. This can only be done once."
                  : `Sign in to continue to ${config.brand.name}.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!setup && config.auth.oidcEnabled && (
              <>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={signInOidc}
                >
                  <Building2 />
                  Continue with {config.auth.oidcLabel}
                </Button>
                <div className="my-5 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-[11px] uppercase tracking-[.18em] text-muted-foreground">
                    or
                  </span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}
            <form onSubmit={submit} className="space-y-4">
              {setup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={setup ? 12 : undefined}
                  autoComplete={setup ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                />
              </div>
              {setup && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      minLength={12}
                      autoComplete="new-password"
                      value={form.confirm}
                      onChange={(e) =>
                        setForm({ ...form, confirm: e.target.value })
                      }
                      required
                    />
                  </div>
                  {config.setup.claimRequired && (
                    <div className="space-y-2">
                      <Label htmlFor="claim">Setup claim token</Label>
                      <Input
                        id="claim"
                        type="password"
                        value={form.claimToken}
                        onChange={(e) =>
                          setForm({ ...form, claimToken: e.target.value })
                        }
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Provided by the installation operator.
                      </p>
                    </div>
                  )}
                </>
              )}
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button size="lg" className="w-full" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : setup
                    ? "Create administrator"
                    : "Sign in"}
                <ArrowRight />
              </Button>
              {setup && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                  Use at least 12 characters with a letter and number. Local
                  access remains available as your recovery path.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
