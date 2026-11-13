import { useQuery } from "@tanstack/react-query";

import { fetchMe } from "@/lib/me";

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled,
    retry: false,
  });
}
