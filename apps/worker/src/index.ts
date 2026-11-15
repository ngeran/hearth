import { healthResponseSchema, SERVICE_NAME } from "@hearth/shared";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { createAuth } from "./auth";
import { ChatRoom } from "./chat-room";
import type { Env } from "./env";
import { recordErrorEvent } from "./lib/admin";
import { handlePushBatch } from "./lib/push-jobs";
import { requireSameOrigin } from "./middleware/session";
import { adminRoutes } from "./routes/admin";
import { campusesRoutes } from "./routes/campuses";
import { chatsRoutes } from "./routes/chats";
import { matchesRoutes } from "./routes/matches";
import { meRoutes } from "./routes/me";
import { pushRoutes } from "./routes/push";
import { roomsRoutes } from "./routes/rooms";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", requestId());
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: "same-origin",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    xXssProtection: false,
    permissionsPolicy: {
      camera: [],
      geolocation: [],
      microphone: [],
      payment: [],
    },
  }),
);
app.use("/api/v1/*", requireSameOrigin);

const routes = app
  .get("/api/v1/health", async (c) => {
    const check = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

    if (check?.ok !== 1) {
      return c.json(
        {
          error: {
            code: "service_unavailable",
            message: "The database is not ready.",
          },
        },
        503,
      );
    }

    return c.json(
      healthResponseSchema.parse({
        status: "ok",
        service: SERVICE_NAME,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    );
  })
  .on(["GET", "POST"], "/api/auth/*", async (c) => createAuth(c.env).handler(c.req.raw))
  .route("/api/v1/me", meRoutes)
  .route("/api/v1/campuses", campusesRoutes)
  .route("/api/v1/matches", matchesRoutes)
  .route("/api/v1/chats", chatsRoutes)
  .route("/api/v1/rooms", roomsRoutes)
  .route("/api/v1/me/push", pushRoutes)
  .route("/api/v1/admin", adminRoutes)
  .notFound((c) =>
    c.json(
      {
        error: {
          code: "not_found",
          message: "The requested resource was not found.",
        },
      },
      404,
    ),
  )
  .onError((error, c) => {
    // Request IDs and error names are enough to find a stack in Cloudflare logs.
    // Messages are omitted because auth and email errors can contain addresses.
    console.error({
      event: "api_error",
      requestId: c.get("requestId"),
      errorName: error.name,
    });
    // M7 console: one scrubbed row per unhandled error (never throws).
    recordErrorEvent(c.env, c, error);

    return c.json(
      {
        error: {
          code: "internal_error",
          message: "Something went wrong. Please try again.",
        },
      },
      500,
    );
  });

export type AppType = typeof routes;

export { ChatRoom };

export default {
  fetch: routes.fetch,
  async scheduled() {
    // Deliberately empty: M3 computes matches on read (docs/specs/M3.md);
    // a batch only becomes interesting at MATCH_POOL_THRESHOLD.
  },
  async queue(batch, env) {
    // Chat notification jobs (docs/specs/M6.md): unread-gated web push,
    // delivered off the JOBS queue so sends never wait on push services.
    await handlePushBatch(batch, env);
  },
} satisfies ExportedHandler<Env>;
