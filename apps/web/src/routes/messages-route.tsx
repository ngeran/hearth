import type { ChatThread } from "@hearth/shared";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { PageError, PageLoading } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { startChat } from "@/lib/chats";
import { useChats, useSendMessage, useThreadMessages } from "@/lib/use-chats";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

/** Initials avatar label, mirroring the matches card. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** Calm relative timestamps: coarse steps only, then a real date. */
function formatRelativeTime(sentAt: number, t: TFunction, language: string): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - sentAt));
  if (seconds < 60) return t("messages.time.now");
  if (seconds < 3600) return t("messages.time.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86_400) return t("messages.time.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 604_800) return t("messages.time.daysAgo", { count: Math.floor(seconds / 86_400) });
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(sentAt * 1000);
}

/**
 * The messages screen: thread list plus one conversation. Mobile swaps between
 * the two panes; desktop shows them side by side. Conversations poll quietly
 * every 5 s while the tab is visible — pauses stay invisible by design.
 */
export function MessagesRoute() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSession();
  const me = useMe(Boolean(session.data));
  const chats = useChats(Boolean(session.data));
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [openErrorPeerId, setOpenErrorPeerId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const lastOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    document.title = t("messages.title");
  }, [t]);

  // "Say hi" lands here as /messages?with=<userId>: create the thread
  // (idempotent), then open it. The ref guard keeps StrictMode's double effect
  // from firing the request twice; failure shows an inline retry.
  const openThread = useCallback(
    (peerId: string) => {
      startChat(peerId)
        .then(() => {
          setActivePeerId(peerId);
          void queryClient.invalidateQueries({ queryKey: ["chats"] });
        })
        .catch(() => {
          setOpenErrorPeerId(peerId);
        });
    },
    [queryClient],
  );

  useEffect(() => {
    const withParam = searchParams.get("with");
    if (!withParam || lastOpenedRef.current === withParam) return;
    lastOpenedRef.current = withParam;
    setSearchParams({}, { replace: true });
    openThread(withParam);
  }, [searchParams, setSearchParams, openThread]);

  const threads = useMemo(() => chats.data?.chats ?? [], [chats.data]);
  const activeThread = threads.find((thread) => thread.peerId === activePeerId) ?? null;

  // Desktop preselects the first thread so the pane is never empty; a
  // selection that vanishes (account deletion) falls back to the list.
  useEffect(() => {
    if (threads.length === 0) return;
    const stillThere = threads.some((thread) => thread.peerId === activePeerId);
    if (stillThere) return;
    const first = threads[0]?.peerId ?? null;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    setActivePeerId(isDesktop ? first : null);
  }, [threads, activePeerId]);

  if (me.isPending) return <PageLoading label={t("common.loading")} />;
  if (me.isError)
    return (
      <PageError
        title={t("common.errorTitle")}
        body={t("common.errorBody")}
        actionLabel={t("common.retry")}
        onAction={() => void me.refetch()}
      />
    );

  const myId = me.data?.user.id ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <section
        aria-label={t("messages.title")}
        className={cn("min-w-0", activeThread && "hidden lg:block")}
      >
        {chats.isPending ? (
          <PageLoading label={t("common.loading")} />
        ) : chats.isError ? (
          <PageError
            title={t("common.errorTitle")}
            body={t("common.errorBody")}
            actionLabel={t("common.retry")}
            onAction={() => void chats.refetch()}
          />
        ) : threads.length === 0 ? (
          <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-secondary">
              <MessageCircle aria-hidden="true" className="size-7" />
            </span>
            <h1 className="mt-4 text-display-lg-mobile">{t("messages.empty.title")}</h1>
            <p className="mt-3 text-base text-muted-foreground">{t("messages.empty.body")}</p>
            <Button asChild className="mt-6">
              <Link to="/matches">{t("messages.empty.action")}</Link>
            </Button>
          </section>
        ) : (
          <>
            {openErrorPeerId && (
              <p
                role="alert"
                className="mb-3 rounded-card border bg-card p-4 text-sm text-error shadow-soft"
              >
                {t("common.errorBody")}{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => {
                    const peerId = openErrorPeerId;
                    setOpenErrorPeerId(null);
                    openThread(peerId);
                  }}
                >
                  {t("common.retry")}
                </button>
              </p>
            )}
            <ul className="space-y-3">
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.peerId}
                  thread={thread}
                  selected={thread.peerId === activePeerId}
                  onSelect={() => setActivePeerId(thread.peerId)}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {activeThread && myId && (
        <Conversation thread={activeThread} myId={myId} onBack={() => setActivePeerId(null)} />
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: ChatThread;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const timeLabel = thread.lastMessage
    ? formatRelativeTime(thread.lastMessage.sentAt, t, i18n.language)
    : "";

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={
          thread.unread
            ? `${t("messages.open", { name: thread.peerName })}, ${t("messages.unread")}`
            : t("messages.open", { name: thread.peerName })
        }
        className={cn(
          "flex w-full items-center gap-4 rounded-card border bg-card p-4 text-left shadow-soft transition-colors hover:bg-surface-container-high/40",
          selected && "border-primary bg-surface-container-high/40",
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-sm font-bold text-secondary uppercase">
          {initialsOf(thread.peerName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{thread.peerName}</span>
            {timeLabel && (
              <span className="shrink-0 text-xs text-muted-foreground">{timeLabel}</span>
            )}
          </span>
          {thread.peerArea && (
            <span className="block truncate text-sm text-muted-foreground">{thread.peerArea}</span>
          )}
          <span className="block truncate text-sm text-muted-foreground">
            {thread.lastMessage ? thread.lastMessage.body : t("messages.conversation.emptyTitle")}
          </span>
        </span>
        {thread.unread && (
          <span className="flex size-2.5 shrink-0 rounded-full bg-primary">
            <span className="sr-only">{t("messages.unread")}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function Conversation({
  thread,
  myId,
  onBack,
}: {
  thread: ChatThread;
  myId: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const messages = useThreadMessages(thread.peerId, true);
  const send = useSendMessage(thread.peerId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  // Newest message in view whenever the conversation updates.
  const messagesData = messages.data;
  useEffect(() => {
    if (!messagesData) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messagesData]);

  // "Say hi" should land on a ready keyboard: focus the composer per thread.
  useEffect(() => {
    if (thread.peerId) textareaRef.current?.focus();
  }, [thread.peerId]);

  const submit = () => {
    const body = value.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => {
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      },
    });
  };

  const fullTimestamp = (sentAt: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(sentAt * 1000);

  return (
    <section
      aria-label={t("messages.open", { name: thread.peerName })}
      className="flex min-h-0 min-w-0 flex-col gap-3"
    >
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.back")}
          onClick={onBack}
          className="lg:hidden"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <h2 className="truncate font-semibold">{thread.peerName}</h2>
        {thread.peerArea && (
          <span className="truncate text-sm text-muted-foreground">{thread.peerArea}</span>
        )}
      </header>

      <div className="flex max-h-[55dvh] min-h-48 flex-1 flex-col gap-2 overflow-y-auto rounded-card border bg-card p-4 shadow-soft lg:max-h-[calc(100dvh-16rem)]">
        {messages.isError ? (
          <p role="alert" className="m-auto text-sm text-error">
            {t("common.errorBody")}
          </p>
        ) : messages.data && messages.data.messages.length > 0 ? (
          <ul className="flex flex-1 flex-col gap-2">
            {messages.data.messages.map((message) => (
              <li
                key={message.seq}
                title={fullTimestamp(message.sentAt)}
                className={cn(
                  "max-w-[85%] rounded-card px-4 py-2.5 whitespace-pre-wrap break-words",
                  message.author === myId
                    ? "self-end bg-primary/15 text-primary"
                    : "self-start bg-surface-container-high text-on-surface",
                )}
              >
                {message.body}
              </li>
            ))}
          </ul>
        ) : (
          <div className="m-auto max-w-xs text-center">
            <p className="font-medium">{t("messages.conversation.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("messages.conversation.emptyBody")}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="message-composer" className="sr-only">
          {t("messages.composer.placeholder")}
        </label>
        <textarea
          id="message-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={t("messages.composer.placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
            event.preventDefault();
            submit();
          }}
          className="w-full resize-none rounded-control border bg-surface-container-lowest p-3"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {send.isError ? (
            <p role="alert" className="text-sm text-error">
              {t("messages.composer.sendFailed")}
            </p>
          ) : (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {value.length > 900
                ? t("messages.composer.counter", { count: 1000 - value.length })
                : ""}
            </span>
          )}
          <Button type="submit" disabled={!value.trim() || send.isPending}>
            {send.isPending ? t("messages.composer.sending") : t("messages.composer.send")}
          </Button>
        </div>
      </form>
    </section>
  );
}
