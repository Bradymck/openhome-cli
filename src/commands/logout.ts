import { getConfig, saveConfig } from "../config/store.js";
import { keychainDelete } from "../config/keychain.js";
import { success } from "../ui/format.js";

export async function logoutCommand(): Promise<void> {
  // Clear API key from keychain + config
  keychainDelete();
  // Clear JWT from keychain (separate keychain entry)
  keychainDelete("openhome-cli", "jwt");

  const config = getConfig();
  delete config.api_key;
  delete config.jwt;
  delete config.default_personality_id;
  saveConfig(config);

  success("Logged out. All credentials cleared.");
}
