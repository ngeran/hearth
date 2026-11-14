import { type MatchesResponse, matchesResponseSchema } from "@hearth/shared";

import { requestJson } from "@/lib/me";

export async function fetchMatches(): Promise<MatchesResponse> {
  const response = await fetch("/api/v1/matches", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, matchesResponseSchema);
}
