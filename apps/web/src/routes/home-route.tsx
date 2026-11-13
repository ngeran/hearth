import { Eye, Heart, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HealthCard } from "@/components/health-card";
import { HomeIllustration } from "@/components/home-illustration";

const values = [
  {
    title: "home.values.compatibilityTitle",
    body: "home.values.compatibilityBody",
    icon: Heart,
  },
  {
    title: "home.values.clarityTitle",
    body: "home.values.clarityBody",
    icon: Eye,
  },
  {
    title: "home.values.privacyTitle",
    body: "home.values.privacyBody",
    icon: ShieldCheck,
  },
] as const;

export function HomeRoute() {
  const { t } = useTranslation();

  return (
    <>
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-12">
        <div>
          <p className="inline-flex rounded-full border border-secondary-brand/30 bg-secondary-brand/10 px-3 py-1 text-xs font-semibold tracking-wide text-secondary uppercase">
            {t("home.eyebrow")}
          </p>
          <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {t("home.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t("home.body")}
          </p>
        </div>

        <div className="rounded-card border bg-card p-4 text-card-foreground shadow-soft">
          <HomeIllustration />
          <div className="mt-3">
            <HealthCard />
          </div>
        </div>
      </section>

      <section aria-labelledby="values-heading" className="mt-14">
        <h2 id="values-heading" className="font-serif text-2xl font-semibold tracking-tight">
          {t("home.values.label")}
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {values.map((value) => {
            const Icon = value.icon;

            return (
              <article key={value.title} className="rounded-card border bg-surface p-5">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-secondary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 font-serif text-xl font-semibold">{t(value.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(value.body)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
