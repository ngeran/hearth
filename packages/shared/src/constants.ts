export const APP_NAME = "Hearth";
export const SERVICE_NAME = "hearth";

export const SUPPORTED_LANGUAGES = ["en", "el"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const MATCH_POOL_THRESHOLD = 500;
export const MATCH_BATCH_EXPIRY_DAYS = 14;
