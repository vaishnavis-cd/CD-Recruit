import { useState, useEffect } from "react";
import { getUserProfile } from "../lib/auth";
import { API_BASE, getAuthHeaders } from "../lib/store";

export function usePermissions() {
  const profile = getUserProfile();
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/settings/permissions`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.matrix) {
            setPermissionsMatrix(data.matrix);
          }
        }
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasPermission = (permissionKey: string): boolean => {
    if (!profile) return false;
    if (profile.role === "ADMIN") return true;
    const userRole = profile.role;
    const allowed = permissionsMatrix[userRole] || [];
    return allowed.includes(permissionKey);
  };

  return {
    profile,
    isAdmin: profile?.role === "ADMIN",
    hasPermission,
    loading,
  };
}
