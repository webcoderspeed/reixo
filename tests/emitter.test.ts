import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../src/utils/emitter';

describe('EventEmitter', () => {
  it('should subscribe and emit events', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.on('test', listener);
    emitter.emit('test', 'data');

    expect(listener).toHaveBeenCalledWith('data');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple listeners for the same event', () => {
    const emitter = new EventEmitter();
    const listenerOne = vi.fn();
    const listenerTwo = vi.fn();

    emitter.on('test', listenerOne);
    emitter.on('test', listenerTwo);
    emitter.emit('test');

    expect(listenerOne).toHaveBeenCalledTimes(1);
    expect(listenerTwo).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe using off', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.on('test', listener);
    emitter.off('test', listener);
    emitter.emit('test');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should unsubscribe using returned function', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    const unsubscribe = emitter.on('test', listener);
    unsubscribe();
    emitter.emit('test');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle once listener', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.once('test', listener);
    emitter.emit('test', 1);
    emitter.emit('test', 2);

    expect(listener).toHaveBeenCalledWith(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should remove all listeners for a specific event', () => {
    const emitter = new EventEmitter();
    const listenerOne = vi.fn();
    const listenerTwo = vi.fn();

    emitter.on('test', listenerOne);
    emitter.on('other', listenerTwo);
    emitter.removeAllListeners('test');

    emitter.emit('test');
    emitter.emit('other');

    expect(listenerOne).not.toHaveBeenCalled();
    expect(listenerTwo).toHaveBeenCalled();
  });

  it('should remove all listeners', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.on('test', listener);
    emitter.removeAllListeners();
    emitter.emit('test');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should safely handle off for unknown event', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    // Should not throw
    emitter.off('unknown', listener);
  });

  it('should support strict typing', () => {
    type TestEvents = {
      foo: [string];
      bar: [number, boolean];
    };
    const emitter = new EventEmitter<TestEvents>();
    const fooListener = vi.fn();

    emitter.on('foo', fooListener);
    emitter.emit('foo', 'hello');

    expect(fooListener).toHaveBeenCalledWith('hello');
  });
});
