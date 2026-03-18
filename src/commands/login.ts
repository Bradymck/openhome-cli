import { ApiClient } from "../api/client.js";
import { getConfig, saveConfig, saveApiKey } from "../config/store.js";
import { success, error, info, p, handleCancel } from "../ui/format.js";

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

  let personalities: Awaited<ReturnType<ApiClient["getPersonalities"]>>;
  try {
    const client = new ApiClient(apiKey as string);
    personalities = await client.getPersonalities();
    s.stop("API key verified.");
  } catch (err) {
    s.stop("Verification failed.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  saveApiKey(apiKey as string);

  if (personalities.length === 0) {
    info("No personalities found. Create one at https://app.openhome.com");
    p.outro("Login complete.");
    return;
  }

  p.note(
    personalities.map((pers) => `${pers.name} (${pers.id})`).join("\n"),
    `Found ${personalities.length} personality(s)`,
  );

  const defaultPersonality = await p.select({
    message: "Set your default personality",
    options: [
      ...personalities.map((pers) => ({
        value: pers.id,
        label: pers.name,
        hint: pers.description ?? pers.id,
      })),
      { value: "__skip__", label: "Skip", hint: "set later" },
    ],
  });
  handleCancel(defaultPersonality);

  if (defaultPersonality !== "__skip__") {
    const config = getConfig();
    config.default_personality_id = defaultPersonality as string;
    saveConfig(config);
    success(`Default personality: ${defaultPersonality}`);
  }

  p.outro("You're ready to deploy abilities! 🚀");
}
