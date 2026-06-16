/**
 * Service responsible for parsing event names.
 */
export class EventNameParser {
  /**
   * Parse a full event name into namespace and event name.
   * Format: namespace.eventName where namespace is everything before the last dot.
   *
   * @param fullEventName - Full event name (e.g., "UserManagement.Auth.UserLoggedIn")
   * @returns Object with namespace and eventName
   * @throws Error if the event name format is invalid
   */
  parse(fullEventName: string): {
    namespace: string;
    eventName: string;
  } {
    if (!fullEventName || typeof fullEventName !== "string") {
      throw new Error(
        `Invalid event name: expected a non-empty string, got ${typeof fullEventName}`,
      );
    }

    const lastDotIndex = fullEventName.lastIndexOf(".");
    
    if (lastDotIndex === -1) {
      throw new Error(
        `Invalid event name format: "${fullEventName}". Expected format: "namespace.eventName"`,
      );
    }

    const namespace = fullEventName.substring(0, lastDotIndex);
    const eventName = fullEventName.substring(lastDotIndex + 1);

    if (!namespace || !eventName) {
      throw new Error(
        `Invalid event name format: "${fullEventName}". Both namespace and event name must be non-empty.`,
      );
    }

    return { namespace, eventName };
  }
}
