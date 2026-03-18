import { ApiClient } from "../api/client.js";
import { saveApiKey } from "../config/store.js";
import { success, error, p, handleCancel } from "../ui/format.js";

export async function loginCommand(): Promise<void> {
  p.intro("🔑 OpenHome Login");

  const apiKey = await p.password({
    message: "Enter your OpenHome API key",
    validate: (val) => {
      if (!val || !val.trim()) return "API key is required";
    },
  });
  handleCancel(apiKey);

  const s = p.spinner();
  s.start("Verifying API key...");

  try {
    const client = new ApiClient(apiKey as string);
    await client.getPersonalities();
    s.stop("API key verified.");
  } catch (err) {
    s.stop("Verification failed.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  saveApiKey(apiKey as string);
  success("API key saved.");

  p.outro("Logged in! You're ready to go.");
}
