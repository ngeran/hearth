import type { AppType } from "@hearth/worker";
import { hc } from "hono/client";

export const api = hc<AppType>("/");
