import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchChats, fetchThreadMessages, sendThreadMessage } from "@/lib/chats";

const MESSAGES_POLL_MS = 5000;

/** Poll the conversation only while the tab is visible (calm UX, M4 spec). */
function pollWhileVisible(): number | false {
  return typeof document === "undefined" || document.visibilityState === "visible"
    ? MESSAGES_POLL_MS
    : false;
}

/** Thread list; refetches on window focus so previews and dots stay fresh. */
export function useChats(enabled = true) {
  return useQuery({
    queryKey: ["chats"],
    queryFn: fetchChats,
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** One conversation, polled every 5 s while the tab is visible. */
export function useThreadMessages(peerId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["chats", peerId, "messages"],
    queryFn: () => fetchThreadMessages(peerId ?? ""),
    enabled: enabled && peerId !== null,
    retry: false,
    refetchInterval: pollWhileVisible,
    staleTime: 0,
  });
}

/** Send a message, then refresh the thread list (recency + preview). */
export function useSendMessage(peerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => sendThreadMessage(peerId ?? "", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
