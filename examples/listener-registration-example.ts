/**
 * Example demonstrating how Wave automatically registers bus listeners
 * based on the domain configuration.
 */

import { Wave } from "../index";

/**
 * Example domain configuration structure:
 * 
 * domains: {
 *   "User.Auth": {
 *     commands: {
 *       login: LoginCommandHandler,
 *       logout: LogoutCommandHandler,
 *     },
 *     queries: {
 *       "User.Auth.GetUser": GetUserQueryHandler,
 *       "User.Auth.GetTokens": GetTokensQueryHandler,
 *     },
 *     sagas: {
 *       "UserManagement.Auth.UserLoggedIn": UserLoggedInSaga,
 *       "Billing.Invoice.InvoiceCreated": InvoiceCreatedSaga,
 *     },
 *   },
 * }
 * 
 * When Wave.initialize() is called, it will automatically:
 * 
 * 1. Register command listeners:
 *    - User.Auth.login
 *    - User.Auth.logout
 * 
 * 2. Register query listeners:
 *    - User.Auth.GetUser (namespace: User.Auth, query: GetUser)
 *    - User.Auth.GetTokens (namespace: User.Auth, query: GetTokens)
 * 
 * 3. Register saga listeners (event listeners):
 *    - UserManagement.Auth.UserLoggedIn (listening domain: User.Auth)
 *    - Billing.Invoice.InvoiceCreated (listening domain: User.Auth)
 */

async function main() {
  console.log("=== Wave Listener Registration Example ===\n");

  try {
    // Initialize Wave - this will:
    // 1. Load configuration from wave.config.ts
    // 2. Initialize the message bus
    // 3. Register all listeners based on domain configuration
    await Wave.getInstance().initialize();

    console.log("\n✓ Wave initialized successfully!");
    console.log("✓ All listeners registered and ready to receive messages");

    // At this point, the following listeners are active:
    // - Command listeners for each command in config.domains[namespace].commands
    // - Query listeners for each query in config.domains[namespace].queries
    // - Event listeners (sagas) for each saga in config.domains[namespace].sagas

    console.log("\nListeners are now waiting for messages...");
    console.log("Press Ctrl+C to exit");

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    console.error("Failed to initialize Wave:", error);
    process.exit(1);
  }
}

// Uncomment to run:
// main();

export { main };
