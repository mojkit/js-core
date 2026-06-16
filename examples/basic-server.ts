 import Fastify from "fastify";
 import { loadWaveConfig } from "../server/config-loader";
 import { registerRoutes } from "../server/router";
 
 const fastify = Fastify({
   logger: {
     level: "info",
     transport: {
       target: "pino-pretty",
       options: {
         colorize: true,
       },
     },
   },
 });
 
 const start = async () => {
   try {
     const configPath = process.env.WAVE_CONFIG_PATH || "./__tests__/wave.config.ts";
     
     fastify.log.info(`Loading Wave configuration from: ${configPath}`);
     const config = await loadWaveConfig(configPath);
     
     fastify.log.info(`Found ${Object.keys(config.domains).length} domain(s)`);
     
     await registerRoutes(fastify, config);
     
     const host = config.server?.host || "0.0.0.0";
     const port = config.server?.port || 3000;
     
     await fastify.listen({ port, host });
     
     fastify.log.info(`
 ╔═══════════════════════════════════════════════════════════╗
 ║                                                           ║
 ║   🌊 Wave Server is running!                             ║
 ║                                                           ║
 ║   URL: http://${host}:${port}                        ║
 ║                                                           ║
 ╚═══════════════════════════════════════════════════════════╝
     `);
     
     fastify.log.info("Available routes:");
     console.log(fastify.printRoutes({ commonPrefix: false }));
     
   } catch (err) {
     fastify.log.error("Failed to start server:");
     fastify.log.error(err);
     process.exit(1);
   }
 };
 
 start();
