/**
 * @file index.ts - Public API for Wave events.
 */

export {
  WaveEvent,
  type WaveEventMeta,
  type WaveEventOptions,
  type PlainWaveEvent,
  type PublishableEvent,
  isWaveEventInstance,
  isPlainWaveEvent,
} from './WaveEvent';

export {
  createPublishEvent,
  type PublishEventContext,
  type PublishEventFunction,
} from './createPublishEvent';
