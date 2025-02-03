import {expect, test} from "vitest";
import {ChatGPTReversed} from "../src/index";

test("Retrieves answer from oai", async () => {
  const chatgpt = new ChatGPTReversed();

  const result = await chatgpt.complete("Hey, how are you?");
  console.log("Result: ", result);

  expect(result).toBeTypeOf("string");
});
