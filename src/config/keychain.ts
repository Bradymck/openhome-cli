import { execFileSync } from "node:child_process";

const SERVICE = "openhome-cli";
const ACCOUNT = "api-key";

export function keychainGet(
  service: string = SERVICE,
  account: string = ACCOUNT,
): string | null {
  try {
    const result = execFileSync(
      "security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

export function keychainSet(
  password: string,
  service: string = SERVICE,
  account: string = ACCOUNT,
): boolean {
  try {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-w",
        password,
        "-U",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

export function keychainDelete(
  service: string = SERVICE,
  account: string = ACCOUNT,
): boolean {
  try {
    execFileSync(
      "security",
      ["delete-generic-password", "-a", account, "-s", service],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}
