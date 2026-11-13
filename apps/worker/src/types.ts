import type { RequestIdVariables } from "hono/request-id";

import type { Auth } from "./auth";
import type { Env } from "./env";

type SessionResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;

export type AuthUser = NonNullable<SessionResult>["user"];
export type AuthSession = NonNullable<SessionResult>["session"];

export type AppEnv = {
  Bindings: Env;
  Variables: RequestIdVariables & {
    user: AuthUser;
    session: AuthSession;
  };
};
