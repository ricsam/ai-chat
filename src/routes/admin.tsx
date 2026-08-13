import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Brush,
  Check,
  LockKeyhole,
  Plus,
  RefreshCw,
  Shield,
  UserCog,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-app";
import { api, loadPublicConfig } from "@/lib/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  enabled: boolean;
  createdAt: string;
};
type AdminConfig = {
  brand: {
    productName: string;
    tagline: string;
    primaryColor: string;
    primaryForegroundColor: string;
  };
  oidc: {
    enabled: boolean;
    providerKey?: string;
    label?: string;
    issuer?: string;
    discoveryUrl?: string;
    clientId?: string;
    scopes?: string;
    autoProvision?: boolean;
    linkByEmail?: boolean;
    allowedDomains?: string[];
    hasSecret?: boolean;
    callbackUrl?: string;
  };
};
export const Route = createFileRoute("/admin")({ component: Admin });
function Admin() {
  const { user } = useMe();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<AdminConfig>();
  const [message, setMessage] = useState("");
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const load = useCallback(() => {
    void Promise.all([
      api<{ users: User[] }>("/api/admin/users"),
      api<AdminConfig>("/api/admin/config"),
    ])
      .then(([a, b]) => {
        setUsers(a.users);
        setConfig(b);
      })
      .catch(() => void navigate({ to: "/chat" }));
  }, [navigate]);
  useEffect(() => {
    if (user && user.role !== "admin") void navigate({ to: "/chat" });
    else if (user) load();
  }, [user, load, navigate]);
  if (!config)
    return (
      <AppShell>
        <div className="grid h-full place-items-center text-sm text-muted-foreground">
          Loading administration…
        </div>
      </AppShell>
    );
  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(newUser),
    });
    setNewUser({ name: "", email: "", password: "", role: "user" });
    load();
  };
  const updateUser = async (id: string, patch: object) => {
    await api("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  };
  const saveBrand = async (event: React.FormEvent) => {
    event.preventDefault();
    await api("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify({ brand: config.brand }),
    });
    await loadPublicConfig(true);
    setMessage("Branding saved");
  };
  const saveOidc = async (event: React.FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await api("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify({
        oidc: {
          ...config.oidc,
          clientSecret: form.get("clientSecret") || undefined,
          allowedDomains: String(form.get("allowedDomains") || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        },
      }),
    });
    setMessage("OIDC configuration saved");
    load();
  };
  const testOidc = async () => {
    const data = await api<{ message: string }>("/api/admin/oidc-test", {
      method: "POST",
    });
    setMessage(data.message);
  };
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
          <div className="mb-8">
            <Badge variant="outline" className="mb-3">
              <Shield />
              Administrator
            </Badge>
            <h1 className="font-serif text-4xl tracking-tight">
              Workspace administration
            </h1>
            <p className="mt-2 text-muted-foreground">
              Identity, access, and presentation for this installation.
            </p>
          </div>
          {message && (
            <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
              <Check className="mr-2 inline size-4" />
              {message}
            </div>
          )}
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">
                <UserCog />
                Users
              </TabsTrigger>
              <TabsTrigger value="authentication">
                <LockKeyhole />
                Authentication
              </TabsTrigger>
              <TabsTrigger value="branding">
                <Brush />
                Branding
              </TabsTrigger>
            </TabsList>
            <TabsContent value="users" className="mt-5 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Create user</CardTitle>
                  <CardDescription>
                    The temporary password must be changed after first sign-in.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="grid gap-3 md:grid-cols-[1fr_1.3fr_1fr_auto]"
                    onSubmit={createUser}
                  >
                    <Input
                      placeholder="Name"
                      value={newUser.name}
                      onChange={(e) =>
                        setNewUser({ ...newUser, name: e.target.value })
                      }
                      required
                    />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={newUser.email}
                      onChange={(e) =>
                        setNewUser({ ...newUser, email: e.target.value })
                      }
                      required
                    />
                    <Input
                      type="password"
                      minLength={12}
                      placeholder="Temporary password"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser({ ...newUser, password: e.target.value })
                      }
                      required
                    />
                    <Button>
                      <Plus />
                      Create
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <strong>{row.name}</strong>
                          <span className="block text-xs text-muted-foreground">
                            {row.email}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.enabled ? "Enabled" : "Disabled"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={row.id === user?.id}
                            onClick={() =>
                              updateUser(row.id, {
                                role: row.role === "admin" ? "user" : "admin",
                              })
                            }
                          >
                            {row.role === "admin" ? "Demote" : "Make admin"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={row.id === user?.id}
                            onClick={() =>
                              updateUser(row.id, { enabled: !row.enabled })
                            }
                          >
                            {row.enabled ? "Disable" : "Enable"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
            <TabsContent value="authentication" className="mt-5">
              <Card>
                <CardHeader>
                  <CardTitle>OpenID Connect</CardTitle>
                  <CardDescription>
                    Register the exact callback URI shown below as a
                    confidential web application. Local administrator login
                    remains available.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid max-w-2xl gap-4" onSubmit={saveOidc}>
                    <Toggle
                      label="Enable OIDC"
                      checked={config.oidc.enabled}
                      onChecked={(enabled) =>
                        setConfig({
                          ...config,
                          oidc: { ...config.oidc, enabled },
                        })
                      }
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Provider key">
                        <Input
                          value={config.oidc.providerKey ?? "company-oidc"}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              oidc: {
                                ...config.oidc,
                                providerKey: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                      <Field label="Button label">
                        <Input
                          value={config.oidc.label ?? "Company SSO"}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              oidc: { ...config.oidc, label: e.target.value },
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Issuer">
                      <Input
                        type="url"
                        value={config.oidc.issuer ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            oidc: { ...config.oidc, issuer: e.target.value },
                          })
                        }
                        required
                      />
                    </Field>
                    <Field label="Discovery URL (optional)">
                      <Input
                        type="url"
                        value={config.oidc.discoveryUrl ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            oidc: {
                              ...config.oidc,
                              discoveryUrl: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Client ID">
                      <Input
                        value={config.oidc.clientId ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            oidc: { ...config.oidc, clientId: e.target.value },
                          })
                        }
                        required
                      />
                    </Field>
                    <Field
                      label={`Client secret${config.oidc.hasSecret ? " (leave blank to keep)" : ""}`}
                    >
                      <Input name="clientSecret" type="password" />
                    </Field>
                    <Field label="Allowed email domains (comma separated)">
                      <Input
                        name="allowedDomains"
                        defaultValue={config.oidc.allowedDomains?.join(", ")}
                      />
                    </Field>
                    <Toggle
                      label="Link pre-created users by exact email"
                      checked={config.oidc.linkByEmail ?? false}
                      onChecked={(linkByEmail) =>
                        setConfig({
                          ...config,
                          oidc: { ...config.oidc, linkByEmail },
                        })
                      }
                    />
                    <Toggle
                      label="Automatically provision permitted users"
                      checked={config.oidc.autoProvision ?? false}
                      onChecked={(autoProvision) =>
                        setConfig({
                          ...config,
                          oidc: { ...config.oidc, autoProvision },
                        })
                      }
                    />
                    {config.oidc.callbackUrl && (
                      <div className="rounded-lg bg-muted p-3 font-mono text-xs break-all">
                        {config.oidc.callbackUrl}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button>Save OIDC</Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={testOidc}
                      >
                        <RefreshCw />
                        Test discovery
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="branding" className="mt-5">
              <Card>
                <CardHeader>
                  <CardTitle>White-label identity</CardTitle>
                  <CardDescription>
                    Changes appear on sign-in and throughout the workspace
                    without a restart.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid max-w-2xl gap-4" onSubmit={saveBrand}>
                    <Field label="Product name">
                      <Input
                        value={config.brand.productName}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            brand: {
                              ...config.brand,
                              productName: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Tagline">
                      <Input
                        value={config.brand.tagline}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            brand: { ...config.brand, tagline: e.target.value },
                          })
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Accent color">
                        <Input
                          type="color"
                          value={config.brand.primaryColor}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              brand: {
                                ...config.brand,
                                primaryColor: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                      <Field label="Accent text">
                        <Input
                          type="color"
                          value={config.brand.primaryForegroundColor}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              brand: {
                                ...config.brand,
                                primaryForegroundColor: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Button className="w-fit">Save branding</Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
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
function Toggle({
  label,
  checked,
  onChecked,
}: {
  label: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
}) {
  return (
    <Label className="flex items-center justify-between rounded-lg border p-3 font-normal">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChecked} />
    </Label>
  );
}
