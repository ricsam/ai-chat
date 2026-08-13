export type PublicConfig = {
  setup: { required: boolean; claimRequired: boolean };
  brand: {
    name: string;
    tagline: string;
    logo?: string | null;
    favicon?: string | null;
    primaryColor: string;
    primaryForegroundColor: string;
  };
  auth: { oidcEnabled: boolean; oidcLabel: string; providerKey: string };
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  enabled: boolean;
  mustChangePassword: boolean;
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      payload.error?.message || `Request failed (${response.status})`,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

let configPromise: Promise<PublicConfig> | undefined;
export function loadPublicConfig(refresh = false) {
  if (!configPromise || refresh)
    configPromise = api<PublicConfig>("/api/public-config");
  return configPromise;
}
