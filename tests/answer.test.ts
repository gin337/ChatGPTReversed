import {expect, test} from "vitest";
import {ChatGPTReversed} from "../src/index";

test("Retrieves answer from oai", async () => {
  const chatgpt = new ChatGPTReversed();

  const result = await chatgpt.complete("Hey, how are you?");
  expect(result).toBeTypeOf("string");
});
