import { existsSync } from 'node:fs'

/**
 * Loads a local .env into process.env (existing variables win). Returns only
 * the *names* that are now set, so callers can report configuration without
 * ever printing a value.
 */
export function loadLocalEnv(path = '.env', names: string[] = []): string[] {
  if (existsSync(path)) process.loadEnvFile(path)
  return names.filter((n) => !!process.env[n]?.trim())
}
