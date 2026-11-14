import { Heart, MessageCircle, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

const pageCopy = {
  matches: {
    title: "placeholder.matches.title",
    body: "placeholder.matches.body",
  },
  messages: {
    title: "placeholder.messages.title",
    body: "placeholder.messages.body",
  },
  profile: {
    title: "placeholder.profile.title",
    body: "placeholder.profile.body",
  },
} as const;

const pageIcons = {
  matches: Heart,
  messages: MessageCircle,
  profile: UserRound,
} as const;

type PlaceholderPageProps = {
  kind: keyof typeof pageCopy;
};

export function PlaceholderPage({ kind }: PlaceholderPageProps) {
  const { t } = useTranslation();
  const copy = pageCopy[kind];
  const Icon = pageIcons[kind];

  return (
    <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-secondary">
        <Icon aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-6 text-display-lg-mobile">{t(copy.title)}</h1>
      <p className="mt-3 text-base text-muted-foreground">{t(copy.body)}</p>
    </section>
  );
}
