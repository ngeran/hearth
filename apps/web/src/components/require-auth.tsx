import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";

import { PageLoading } from "@/components/page-states";
import { useSession } from "@/lib/auth-client";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return <PageLoading label={t("common.loading")} />;
  }

  if (!data) {
    return (
      <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  return <>{children}</>;
}
