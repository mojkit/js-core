/**
 * Example demonstrating both function-based and class-based handlers.
 * 
 * Handlers that actually run:
 * 1. Async functions or arrows: (message, context) => Promise<any>
 * 2. Class constructors (instantiated per message; this.app is assigned)
 *
 * A class instance (`new Handler()` stored in the config) is rejected with
 * `Invalid handler type: object`. A non-async `function` declaration is
 * treated as a class because it has a prototype.
 */

import type { HandlerContext } from "../bus/types";

// ============================================================================
// Function-based handlers
// ============================================================================

async function loginCommand(message: any, context: HandlerContext) {
  console.log("[Function Command] Login:", message);
  return { success: true, userId: "user-123" };
}

async function getUserQuery(message: any, context: HandlerContext) {
  console.log("[Function Query] GetUser:", message);
  return { id: "user-123", name: "John Doe" };
}

async function userLoggedInSaga(message: any, context: HandlerContext) {
  console.log("[Function Saga] UserLoggedIn:", message);
  // Perform side effects like sending emails, updating analytics, etc.
}

// ============================================================================
// Class-based handlers
// ============================================================================

class LogoutCommandHandler {
  async handler(message: any, context: HandlerContext) {
    console.log("[Class Command] Logout:", message);
    return { success: true };
  }
}

class GetTokensQueryHandler {
  async handler(message: any, context: HandlerContext) {
    console.log("[Class Query] GetTokens:", message);
    return { accessToken: "abc123", refreshToken: "xyz789" };
  }
}

class InvoiceCreatedSagaHandler {
  async handler(message: any, context: HandlerContext) {
    console.log("[Class Saga] InvoiceCreated:", message);
    // Perform side effects
  }
}

// ============================================================================
// Domain configuration mixing both styles
// ============================================================================

export default {
  commands: {
    login: loginCommand,                    // async function
    logout: LogoutCommandHandler,           // class constructor, not an instance
  },
  queries: {
    getUser: getUserQuery,                  // async function
    getTokens: GetTokensQueryHandler,       // class constructor
  },
  sagas: {
    "UserManagement.Auth.UserLoggedIn": userLoggedInSaga,
    "Billing.Invoice.InvoiceCreated": InvoiceCreatedSagaHandler,
  },
};
