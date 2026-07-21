/**
 * @file index.ts - Public API for Mojkit events.
 */

export {
  MojkitEvent,
  type MojkitEventMeta,
  type MojkitEventOptions,
  type PlainMojkitEvent,
  type PublishableEvent,
  isMojkitEventInstance,
  isPlainMojkitEvent,
} from './MojkitEvent';

export {
  createPublishEvent,
  type PublishEventContext,
  type PublishEventFunction,
} from './createPublishEvent';
