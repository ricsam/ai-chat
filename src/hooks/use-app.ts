import { useCallback, useEffect, useState } from "react";
import {
  api,
  loadPublicConfig,
  type AppUser,
  type PublicConfig,
} from "@/lib/api";

export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig>();
  useEffect(() => {
    void loadPublicConfig().then((next) => {
      setConfig(next);
      document.documentElement.style.setProperty(
        "--primary-brand",
        next.brand.primaryColor,
      );
      document.documentElement.style.setProperty(
        "--primary-brand-foreground",
        next.brand.primaryForegroundColor,
      );
      document.title = `${next.brand.name} — AI chat`;
      if (next.brand.favicon) {
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.append(link);
        }
        link.href = next.brand.favicon;
      }
    });
  }, []);
  return config;
}

export function useMe() {
  const [user, setUser] = useState<AppUser | null>();
  const refresh = useCallback(() => {
    void api<{ user: AppUser }>("/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);
  useEffect(refresh, [refresh]);
  return { user, refresh };
}
