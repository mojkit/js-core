/**
 * Example demonstrating both function-based and class-based handlers.
 * 
 * Handlers can be implemented as either:
 * 1. Plain async functions: (message, context) => Promise<any>
 * 2. Class instances with a handler method
 * 3. Class constructors (will be instantiated automatically)
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
    login: loginCommand,                    // Function
    logout: new LogoutCommandHandler(),     // Class instance
  },
  queries: {
    getUser: getUserQuery,                  // Function
    getTokens: GetTokensQueryHandler,       // Class constructor
  },
  sagas: {
    "UserManagement.Auth.UserLoggedIn": userLoggedInSaga,           // Function
    "Billing.Invoice.InvoiceCreated": new InvoiceCreatedSagaHandler(), // Class instance
  },
};
