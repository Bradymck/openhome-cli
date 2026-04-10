import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
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

    const dirName = basename(dirPath);
    const ignore = [
      "**/__pycache__/**",
      "**/*.pyc",
      "**/.git/**",
      "**/.env",
      "**/.env.*",
      "**/secrets.*",
      "**/*.key",
      "**/*.pem",
    ];
    // Wrap under a top-level directory — server requires single root dir
    archive.glob("**/*", { cwd: dirPath, ignore }, { prefix: dirName });

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
    const dirName = basename(dirPath);
    const ignore = [
      "**/__pycache__/**",
      "**/*.pyc",
      "**/.git/**",
      "**/.env",
      "**/.env.*",
      "**/secrets.*",
      "**/*.key",
      "**/*.pem",
    ];

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    archive.glob("**/*", { cwd: dirPath, ignore }, { prefix: dirName });

    archive.finalize().catch(reject);
  });
}
