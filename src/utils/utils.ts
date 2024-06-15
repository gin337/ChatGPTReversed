import {randomUUID, randomInt, createHash} from "crypto";

export const randomIP = async (): Promise<string> =>
  Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join(".");

export const _randomUUID = (): string => randomUUID().toString();

export async function solveSentinelChallenge(seed: string, difficulty: string): Promise<string> {
  const cores = [8, 12, 16, 24];
  const screens = [3000, 4000, 6000];

  const core = cores[randomInt(0, cores.length)];
  const screen = screens[randomInt(0, screens.length)];

  const now = new Date(Date.now() - 8 * 3600 * 1000);
  const parseTime = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");

  const config = [
    core + screen,
    parseTime,
    4294705152,
    0,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ];

  const diffLen = difficulty.length / 2;

  for (let i = 0; i < 100000; i++) {
    config[3] = i;
    const jsonData = JSON.stringify(config);
    const base = Buffer.from(jsonData).toString("base64");
    const hashValue = createHash("sha3-512")
      .update(seed + base)
      .digest();

    if (hashValue.toString("hex").substring(0, diffLen) <= difficulty) {
      const result = "gAAAAAB" + base;
      return result;
    }
  }

  const fallbackBase = Buffer.from(`"${seed}"`).toString("base64");
  return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallbackBase;
}
