// Type shim for webpush-webcrypto 1.0.5 — the package ships no TypeScript
// declarations (verified against its lib/webpush.js dist). Keep this minimal
// and structural: only the surface the worker actually calls.
declare module "webpush-webcrypto" {
  /** base64url-encoded VAPID pair, as produced by ApplicationServerKeys.toJSON(). */
  export interface ApplicationServerKeyPair {
    publicKey: string;
    privateKey: string;
  }

  export class ApplicationServerKeys {
    constructor(publicKey: CryptoKey, privateKey: CryptoKey);

    static generate(): Promise<ApplicationServerKeys>;

    static fromJSON(keys: ApplicationServerKeyPair): Promise<ApplicationServerKeys>;

    toJSON(): Promise<ApplicationServerKeyPair>;
  }

  export interface PushTarget {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface PushHTTPRequest {
    headers: Record<string, string>;
    body: ArrayBuffer;
    endpoint: string;
  }

  export function generatePushHTTPRequest(options: {
    payload: string | Uint8Array;
    applicationServerKeys: ApplicationServerKeys;
    target: PushTarget;
    /** VAPID "sub" contact (mailto: or https: URL). */
    adminContact: string;
    ttl: number;
    topic?: string;
    urgency?: "very-low" | "low" | "normal" | "high";
  }): Promise<PushHTTPRequest>;
}
