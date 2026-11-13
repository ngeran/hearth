import type { Env as WorkerEnv } from "../src/env";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerEnv {}
}
