import { z } from "zod";

import { SERVICE_NAME } from "./constants";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal(SERVICE_NAME),
  timestamp: z.number().int().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
