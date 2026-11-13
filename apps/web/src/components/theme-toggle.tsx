import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, resolveTheme, THEME_MODES, type ThemeMode } from "@/lib/theme";

const themeLabels = {
  system: "header.themeMode.system",
  light: "header.themeMode.light",
  dark: "header.themeMode.dark",
} as const;

export function ThemeToggle() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(mode);

    if (mode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode]);

  const currentIndex = THEME_MODES.indexOf(mode);
  const nextMode = THEME_MODES[(currentIndex + 1) % THEME_MODES.length] ?? "system";
  const label = t("header.themeAction", { mode: t(themeLabels[mode]) });
  const ResolvedIcon = resolveTheme(mode) === "dark" ? Moon : Sun;
  const Icon = mode === "system" ? Monitor : ResolvedIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setMode(nextMode)}
      aria-label={label}
      title={label}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
