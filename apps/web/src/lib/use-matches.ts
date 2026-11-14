import { useQuery } from "@tanstack/react-query";

import { fetchMatches } from "@/lib/matches";

export function useMatches(enabled = true) {
  return useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}
