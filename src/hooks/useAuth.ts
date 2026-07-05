import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { ensureAnonymousAuth } from "../lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    ensureAnonymousAuth()
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : "Authentication failed."))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, error };
}
