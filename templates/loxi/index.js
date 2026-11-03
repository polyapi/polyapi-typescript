const set = require('lodash/set');
const { locks } = require('./locks');
const { loadQnats } = require('../qnats');


class LockManagerQnats {
  constructor(id, path, streamId, lockId, holdTimeout, renewable, capacity, clientId, polyCustom) {
    this.id = id;
    this.path = path;
    this.streamId = streamId;
    this.lockId = lockId;
    this.holdTimeout = holdTimeout;
    this.renewable = renewable;
    this.capacity = capacity;
    this.clientId = clientId;
    this.polyCustom = polyCustom;
  }

  acquire() {
    if (isShuttingDown()) throw new Error(`Cannot acquire lock: Container is shutting down.`);
    const { lockManager } = loadQnats();
    return lockManager.isLocked(this.streamId, this.lockId, {
      holdTimeout: this.holdTimeout,
      renewable: this.renewable,
      capacity: this.capacity,
      expiresAt: this.expiresAt,
    });
  }

  isLocked() {
    if (isShuttingDown()) throw new Error(`Cannot check lock: Container is shutting down.`);
    const { lockManager } = loadQnats();
    return lockManager.isLocked(this.streamId, this.lockId);
  }

  getLockStatus() {
    if (isShuttingDown()) throw new Error(`Cannot check lock: Container is shutting down.`);
    const { lockManager } = loadQnats();
    return lockManager.getLockStatus(this.streamId, this.lockId);
  }

  renew(sessionId) {
    if (isShuttingDown()) throw new Error(`Cannot renew lock: Container is shutting down.`);
    if (!this.renewable) {
      throw new Error(`Cannot renew lock: Lock '${this.path}' is not renewable.`);
    }
    const { lockManager } = loadQnats();
    return lockManager.renew(this.streamId, this.lockId, sessionId);
  }

  release(sessionId) {
    if (isShuttingDown()) throw new Error(`Cannot release lock: Container is shutting down.`);
    const { lockManager } = loadQnats();
    return lockManager.release(this.streamId, this.lockId, sessionId);
  }

  withLock(fn) {
    if (isShuttingDown()) throw new Error(`Cannot acquire lock: Container is shutting down.`);
    const { lockManager } = loadQnats();
    return lockManager.withLock({
      stream: this.streamId,
      lock: this.lockId,
      options: {
        holdTimeout: this.holdTimeout,
        renewable: this.renewable,
        capacity: this.capacity,
        expiresAt: this.expiresAt,
      }
    }, fn);
  }
}

module.exports = (clientId, polyCustom) => locks.reduce(
  (acc, [path, id, streamId, lockId, holdTimeout, renewable, capacity]) =>
    set(acc, path, new LockManagerQnats(id, path, streamId, lockId, holdTimeout, renewable, capacity, clientId, polyCustom)),
  {}
);