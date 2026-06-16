import MyAggregate from "./domains/MyContext/MyAggregate";
import type { WaveConfig } from "../config/types.ts";

export default async function config(): Promise<WaveConfig> {
  return {
    domains: {
      "MyContext.MyAggregate": MyAggregate,
    },
    messageBus: {},
  };
}
