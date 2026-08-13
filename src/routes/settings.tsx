import { createFileRoute } from "@tanstack/react-router";
import { Check, KeyRound, Plus, Server, Trash2, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsPage } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type Model = {
  id: string;
  modelId: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
};
type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
  lastTestSucceeded?: boolean | null;
  lastTestMessage?: string | null;
  models: Model[];
};
export const Route = createFileRoute("/settings")({
  component: ProviderSettings,
});

function ProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [form, setForm] = useState({
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    modelId: "gpt-4o-mini",
    modelName: "GPT-4o mini",
  });
  const load = useCallback(() => {
    void api<{ providers: Provider[] }>("/api/providers").then((data) =>
      setProviders(data.providers),
    );
  }, []);
  useEffect(load, [load]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/api/providers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setOpen(false);
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save provider",
      );
    }
  };
  const test = async (id: string) => {
    setTesting(id);
    try {
      await api("/api/providers/test", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      load();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : "Connection failed");
    } finally {
      setTesting("");
    }
  };
  const remove = async (id: string) => {
    if (
      confirm("Delete this provider, its models, and remove it from chats?")
    ) {
      await api(`/api/providers?id=${id}`, { method: "DELETE" });
      load();
    }
  };
  return (
    <SettingsPage
      title="Model access"
      description="Bring your own OpenAI-compatible endpoint. Credentials are encrypted and only available to your account."
      active="providers"
    >
      <div className="mb-6 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Add provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Connect a provider</DialogTitle>
                <DialogDescription>
                  Any API that implements OpenAI-compatible chat completions can
                  work here.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-5">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Base URL">
                  <Input
                    type="url"
                    value={form.baseUrl}
                    onChange={(e) =>
                      setForm({ ...form, baseUrl: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="API key">
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) =>
                      setForm({ ...form, apiKey: e.target.value })
                    }
                    placeholder="Optional for local providers"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Model ID">
                    <Input
                      value={form.modelId}
                      onChange={(e) =>
                        setForm({ ...form, modelId: e.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field label="Display name">
                    <Input
                      value={form.modelName}
                      onChange={(e) =>
                        setForm({ ...form, modelName: e.target.value })
                      }
                      required
                    />
                  </Field>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button>Save provider</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!providers.length ? (
        <Empty
          icon={<KeyRound />}
          title="No model access yet"
          body="Add an OpenAI-compatible provider to begin your first conversation."
        />
      ) : (
        <div className="grid gap-4">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Server className="size-4 text-primary" />
                    {provider.name}
                    {provider.lastTestSucceeded && (
                      <Badge variant="secondary">
                        <Check />
                        Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    {provider.baseUrl}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(provider.id)}
                >
                  <Trash2 />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testing === provider.id}
                    onClick={() => test(provider.id)}
                  >
                    <Wifi />
                    {testing === provider.id ? "Testing…" : "Test connection"}
                  </Button>
                  {provider.hasApiKey && (
                    <Badge variant="outline">Encrypted key</Badge>
                  )}
                  {provider.models.map((model) => (
                    <Badge
                      key={model.id}
                      variant={model.isDefault ? "default" : "secondary"}
                    >
                      {model.name}
                      {model.isDefault ? " · default" : ""}
                    </Badge>
                  ))}
                </div>
                {provider.lastTestMessage && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {provider.lastTestMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </SettingsPage>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed py-16 text-center">
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="font-medium">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
