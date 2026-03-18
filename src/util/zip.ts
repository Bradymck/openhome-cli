import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { Writable } from "node:stream";

export async function createAbilityZip(dirPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    writable.on("finish", () => {
      resolve(Buffer.concat(chunks));
    });

    writable.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", reject);
    archive.pipe(writable);

    archive.glob("**/*", {
      cwd: dirPath,
      ignore: ["**/__pycache__/**", "**/*.pyc", "**/.git/**"],
    });

    archive.finalize().catch(reject);
  });
}

// Convenience: write zip to a file path
export async function writeAbilityZip(
  dirPath: string,
  outPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    archive.glob("**/*", {
      cwd: dirPath,
      ignore: ["**/__pycache__/**", "**/*.pyc", "**/.git/**"],
    });

    archive.finalize().catch(reject);
  });
}
