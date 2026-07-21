import MyAggregate from "./domains/MyContext/MyAggregate/index.ts";
import type { MojkitConfig } from "../config/types.ts";

export default async function config(): Promise<MojkitConfig> {
  return {
    domains: {
      "MyContext.MyAggregate": MyAggregate,
    },
    messageBus: {},
  };
}
