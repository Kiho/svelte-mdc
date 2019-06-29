import { preprocess, createEnv, readConfigFile } from "svelte-ts-preprocess";

const env = createEnv();

export const ts = preprocess({
  env,
  compilerOptions: {
    ...readConfigFile(env),
    allowNonTsExtensions: true
  }
});
