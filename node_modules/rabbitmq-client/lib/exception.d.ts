/** Low severity, e.g. nack'd message */
declare class AMQPError extends Error {
    code: string;
}
/** Medium severity. The channel is closed. */
declare class AMQPChannelError extends AMQPError {
}
/** High severity. All pending actions are rejected and all channels are closed. The connection is reset. */
declare class AMQPConnectionError extends AMQPChannelError {
}
export { AMQPError, AMQPConnectionError, AMQPChannelError };
