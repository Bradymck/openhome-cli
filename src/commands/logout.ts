import { getConfig, saveConfig } from "../config/store.js";
import { keychainDelete } from "../config/keychain.js";
import { success } from "../ui/format.js";

export async function logoutCommand(): Promise<void> {
  keychainDelete();

  const config = getConfig();
  delete config.api_key;
  delete config.default_personality_id;
  saveConfig(config);

  success("Logged out. API key and default agent cleared.");
}
