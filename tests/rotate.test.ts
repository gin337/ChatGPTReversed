import {expect, test} from "vitest";
import {ChatGPTReversed} from "../src/index";

test("Rotates all needed values", async () => {
  const chatgpt = new ChatGPTReversed();

  const result = await chatgpt.rotateSessionData();

  expect(result).toEqual({
    uuid: expect.any(String),
    csrf: expect.any(String),
    sentinel: {
      token: expect.any(String),
      proof: expect.any(String),
      oaiSc: expect.any(String),
    },
  });
});
