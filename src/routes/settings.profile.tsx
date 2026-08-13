import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsPage } from "@/components/app-shell";
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
import { useMe } from "@/hooks/use-app";
import { changePassword } from "@/lib/auth-client";

export const Route = createFileRoute("/settings/profile")({
  component: ProfileSettings,
});
function ProfileSettings() {
  const { user } = useMe();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.newPassword !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    const result = await changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
      revokeOtherSessions: true,
    });
    if (result.error)
      setError(result.error.message || "Could not change password");
    else {
      setMessage("Password updated. Other sessions were signed out.");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    }
  };
  return (
    <SettingsPage
      title="Your account"
      description="Review your identity and keep the local recovery credential secure."
      active="profile"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Your account in this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name">
              <Input value={user?.name ?? ""} disabled />
            </Field>
            <Field label="Email">
              <Input value={user?.email ?? ""} disabled />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Use 12–128 characters with a letter and number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <Field label="Current password">
                <Input
                  type="password"
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm({ ...form, currentPassword: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  minLength={12}
                  value={form.newPassword}
                  onChange={(e) =>
                    setForm({ ...form, newPassword: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Confirm password">
                <Input
                  type="password"
                  minLength={12}
                  value={form.confirm}
                  onChange={(e) =>
                    setForm({ ...form, confirm: e.target.value })
                  }
                  required
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-emerald-700">{message}</p>}
              <Button>Update password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
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
