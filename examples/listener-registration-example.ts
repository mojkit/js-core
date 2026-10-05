/**
 * Example demonstrating how Mojkit automatically registers bus listeners
 * based on the domain configuration.
 */

import { Mojkit } from "../index";

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
 *       getUser: GetUserQueryHandler,
 *       getTokens: GetTokensQueryHandler,
 *     },
 *     sagas: {
 *       "UserManagement.Auth.UserLoggedIn": UserLoggedInSaga,
 *       "Billing.Invoice.InvoiceCreated": InvoiceCreatedSaga,
 *     },
 *   },
 * }
 *
 * When Mojkit.initialize() is called, it will automatically:
 *
 * 1. Register command listeners:
 *    - User.Auth.login
 *    - User.Auth.logout
 *
 * 2. Register query listeners. The key is the query name, not a dotted path:
 *    - namespace User.Auth, query getUser
 *    - namespace User.Auth, query getTokens
 *
 * 3. Register saga listeners (event listeners):
 *    - UserManagement.Auth.UserLoggedIn (listening domain: User.Auth)
 *    - Billing.Invoice.InvoiceCreated (listening domain: User.Auth)
 */

async function main() {
  console.log("=== Mojkit Listener Registration Example ===\n");

  try {
    // Initialize Mojkit - this will:
    // 1. Load configuration from mojkit.config.ts
    // 2. Initialize the message bus
    // 3. Register all listeners based on domain configuration
    await Mojkit.getInstance().initialize();

    console.log("\n✓ Mojkit initialized successfully!");
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
    console.error("Failed to initialize Mojkit:", error);
    process.exit(1);
  }
}

// Uncomment to run:
// main();

export { main };
