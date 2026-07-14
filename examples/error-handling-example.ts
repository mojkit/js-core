/**
 * Example: Error Handling in RPC Pattern
 *
 * This example demonstrates how to properly handle and propagate errors
 * across service boundaries using the Wave bus.
 */

import { SerializableError, RemoteServiceError } from "../bus";
import type { HandlerContext } from "../bus/listeners";

// ============================================================================
// 1. Define Domain-Specific Errors
// ============================================================================

/**
 * Custom domain error for validation failures.
 * Extends SerializableError to ensure proper serialization across services.
 */
class ValidationError extends SerializableError {
  constructor(message: string, field: string, value?: any) {
    super(message, 'VALIDATION_ERROR', {
      field,
      value,
    });
  }
}

/**
 * Custom domain error for resource not found scenarios.
 */
class NotFoundError extends SerializableError {
  constructor(resourceType: string, resourceId: string) {
    super(
      `${resourceType} with id ${resourceId} not found`,
      'NOT_FOUND',
      {
        resourceType,
        resourceId,
      }
    );
  }
}

/**
 * Custom domain error for authorization failures.
 */
class UnauthorizedError extends SerializableError {
  constructor(action: string, resource: string) {
    super(
      `Not authorized to ${action} ${resource}`,
      'UNAUTHORIZED',
      {
        action,
        resource,
      }
    );
  }
}

// ============================================================================
// 2. Service A - Command Handler (throws domain errors)
// ============================================================================

interface CreateUserPayload {
  email: string;
  name: string;
  age?: number;
}

/**
 * Command handler that validates input and throws domain-specific errors.
 */
async function createUserCommandHandler(
  message: CreateUserPayload,
  context: HandlerContext
) {
  const { email, name, age } = message;

  // Validation logic
  if (!email || !email.includes('@')) {
    throw new ValidationError('Invalid email format', 'email', email);
  }

  if (!name || name.length < 2) {
    throw new ValidationError('Name must be at least 2 characters', 'name', name);
  }

  if (age !== undefined && (age < 0 || age > 150)) {
    throw new ValidationError('Age must be between 0 and 150', 'age', age);
  }

  // Simulate authorization check
  const userId = context.busMessage.message.body.extensions?.userId;
  if (!userId) {
    throw new UnauthorizedError('create', 'user');
  }

  // Business logic (simulated)
  const newUser = {
    id: `user-${Date.now()}`,
    email,
    name,
    age,
    createdAt: new Date().toISOString(),
  };

  return newUser;
}

// ============================================================================
// 3. Service A - Query Handler (throws domain errors)
// ============================================================================

interface GetUserPayload {
  userId: string;
}

/**
 * Query handler that throws NotFoundError when user doesn't exist.
 */
async function getUserQueryHandler(
  message: GetUserPayload,
  context: HandlerContext
) {
  const { userId } = message;

  // Simulate database lookup
  const user = await findUserById(userId);

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return user;
}

async function findUserById(userId: string) {
  // Simulated database lookup
  if (userId === 'user-123') {
    return { id: userId, name: 'John Doe', email: 'john@example.com' };
  }
  return null;
}

// ============================================================================
// 4. Service B - Calling Service A (handling errors)
// ============================================================================

/**
 * Example of calling a remote command and handling different error types.
 */
async function callCreateUserCommand(app: any) {
  try {
    const result = await app.UserManagement.CreateUser({
      email: 'invalid-email',
      name: 'Jo',
      age: 200,
    });

    console.log('User created:', result);
  } catch (error) {
    if (error instanceof RemoteServiceError) {
      // Handle remote service errors
      console.error('Remote service error:', {
        type: error.type,
        message: error.message,
        code: error.code,
        context: error.context,
      });

      // Handle specific error codes
      switch (error.code) {
        case 'VALIDATION_ERROR':
          console.error('Validation failed:', error.context);
          // Show user-friendly error message
          break;

        case 'UNAUTHORIZED':
          console.error('Authorization failed:', error.context);
          // Redirect to login
          break;

        case 'NOT_FOUND':
          console.error('Resource not found:', error.context);
          // Show 404 page
          break;

        default:
          console.error('Unknown error:', error);
          // Show generic error message
      }
    } else {
      // Handle local errors
      console.error('Local error:', error);
    }
  }
}

/**
 * Example of calling a remote query and handling errors.
 */
async function callGetUserQuery(app: any, userId: string) {
  try {
    const user = await app.UserManagement.GetUser({ userId });
    console.log('User found:', user);
    return user;
  } catch (error) {
    if (error instanceof RemoteServiceError && error.code === 'NOT_FOUND') {
      console.log('User not found, creating default user...');
      // Fallback logic
      return null;
    }
    throw error; // Re-throw if not handled
  }
}

// ============================================================================
// 5. Configuration Example
// ============================================================================

/**
 * Example mojkit.config.ts showing how to register handlers with error handling.
 */
export const exampleConfig = {
  domains: {
    UserManagement: {
      commands: {
        CreateUser: createUserCommandHandler,
      },
      queries: {
        GetUser: getUserQueryHandler,
      },
    },
  },
};

// ============================================================================
// 6. Best Practices
// ============================================================================

/**
 * BEST PRACTICES:
 *
 * 1. Always extend SerializableError for domain errors
 *    - Ensures proper serialization across service boundaries
 *    - Provides consistent error structure
 *
 * 2. Use specific error codes
 *    - Makes error handling easier on the client side
 *    - Enables programmatic error handling
 *
 * 3. Include relevant context
 *    - Helps with debugging
 *    - Provides information for user-friendly error messages
 *
 * 4. Handle RemoteServiceError on the client side
 *    - Check error.code to determine error type
 *    - Provide appropriate fallback behavior
 *
 * 5. Don't expose sensitive information in errors
 *    - Stack traces are only included in development mode
 *    - Be careful with context data
 *
 * 6. Log errors appropriately
 *    - Service A logs the original error
 *    - Service B logs the remote error with context
 */

export {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  createUserCommandHandler,
  getUserQueryHandler,
  callCreateUserCommand,
  callGetUserQuery,
};
