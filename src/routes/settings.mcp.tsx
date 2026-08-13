import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Network,
  Plus,
  ShieldCheck,
  Trash2,
  Wifi,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

type McpServer = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  trustRequired: boolean;
  discoveredTools: Array<{ name: string; description?: string }>;
  lastTestMessage?: string | null;
};
export const Route = createFileRoute("/settings/mcp")({
  component: McpSettings,
});
function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [form, setForm] = useState({
    name: "",
    url: "",
    transport: "http" as "http" | "sse",
    bearerToken: "",
  });
  const load = useCallback(() => {
    void api<{ servers: McpServer[] }>("/api/mcp").then((data) =>
      setServers(data.servers),
    );
  }, []);
  useEffect(load, [load]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          transport: form.transport,
          headers: form.bearerToken
            ? { Authorization: `Bearer ${form.bearerToken}` }
            : undefined,
        }),
      });
      setOpen(false);
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save server",
      );
    }
  };
  const action = async (id: string, trust = false) => {
    setWorking(id);
    try {
      await api(`/api/mcp/${trust ? "trust" : "test"}`, {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      load();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : "Connection failed");
    } finally {
      setWorking("");
    }
  };
  const remove = async (id: string) => {
    if (confirm("Delete this MCP server?")) {
      await api(`/api/mcp?id=${id}`, { method: "DELETE" });
      load();
    }
  };
  return (
    <SettingsPage
      title="Tools & connections"
      description="Connect trusted remote MCP servers. Enabled tools can run automatically in conversations where you select them."
      active="mcp"
    >
      <div className="mb-6 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Add MCP server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Connect an MCP server</DialogTitle>
                <DialogDescription>
                  Remote HTTPS servers only. Review every discovered tool before
                  trusting it.
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
                <Field label="Server URL">
                  <Input
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://tools.example.com/mcp"
                    required
                  />
                </Field>
                <Field label="Transport">
                  <Select
                    value={form.transport}
                    onValueChange={(value) =>
                      setForm({ ...form, transport: value as "http" | "sse" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">Streamable HTTP</SelectItem>
                      <SelectItem value="sse">Legacy SSE</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Bearer token (optional)">
                  <Input
                    type="password"
                    value={form.bearerToken}
                    onChange={(e) =>
                      setForm({ ...form, bearerToken: e.target.value })
                    }
                  />
                </Field>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button>Save server</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mb-5 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p>
          <strong>Automatic execution is enabled.</strong> A selected server’s
          tools may read data or cause external side effects. Only trust servers
          and tools you understand.
        </p>
      </div>
      {!servers.length ? (
        <div className="rounded-2xl border border-dashed py-16 text-center">
          <Network className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-medium">No connected tools</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a remote MCP endpoint to extend your assistant.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {servers.map((server) => (
            <Card key={server.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {server.name}
                    {server.trustRequired ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 text-amber-700"
                      >
                        Review required
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Check />
                        Trusted
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    {server.url}
                  </CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(server.id)}
                >
                  <Trash2 />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working === server.id}
                    onClick={() => action(server.id)}
                  >
                    <Wifi />
                    Test
                  </Button>
                  {server.trustRequired && (
                    <Button
                      size="sm"
                      disabled={working === server.id}
                      onClick={() => action(server.id, true)}
                    >
                      <ShieldCheck />
                      Trust these tools
                    </Button>
                  )}
                  {server.discoveredTools.map((tool) => (
                    <Badge key={tool.name} variant="outline">
                      {tool.name}
                    </Badge>
                  ))}
                </div>
                {server.lastTestMessage && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {server.lastTestMessage}
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
