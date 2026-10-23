const set = require('lodash/set');
const { queues } = require('./queues');
const { loadQnats } = require('../qnats');


class QueueQnats {
  constructor(id, path, streamId, queueId, ordered, compress, checksum, durability, clientId, polyCustom) {
    this.id = id;
    this.path = path;
    this.streamId = streamId;
    this.queueId = queueId;
    this.ordered = ordered;
    this.compress = compress;
    this.checksum = checksum;
    this.durability = durability;
    this.clientId = clientId;
    this.polyCustom = polyCustom;
    this.subscription = null;
  }

  publish(payload, headers) {
    if (isShuttingDown()) throw new Error(`Cannot publish to queue: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.publish(this.streamId, this.queueId, payload, {
      headers,
      compress: this.compress,
      checksum: this.checksum,
      durability: this.durability,
    });
  }

  list(pagination, fromDLQ) {
    if (isShuttingDown()) throw new Error(`Cannot list queue events: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.list(this.streamId, this.queueId, pagination, fromDLQ);
  }

  get(eventId, fromDLQ) {
    if (isShuttingDown()) throw new Error(`Cannot get queue event: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.get(this.streamId, this.queueId, eventId, fromDLQ);
  }

  delete(eventId) {
    if (isShuttingDown()) throw new Error(`Cannot delete queue event: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.delete(this.streamId, this.queueId, eventId);
  }

  deleteAll() {
    if (isShuttingDown()) throw new Error(`Cannot delete all queue events: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.deleteAll(this.streamId, this.queueId);
  }

  skip(eventId) {
    if (isShuttingDown()) throw new Error(`Cannot skip queue event: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.skip(this.streamId, this.queueId, eventId);
  }

  retry(eventId, fromDLQ) {
    if (isShuttingDown()) throw new Error(`Cannot retry queue event: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.events.retry(this.streamId, this.queueId, eventId, fromDLQ);
  }

  subscribe(handler, concurrency) {
    if (isShuttingDown()) throw new Error(`Cannot subscribe to queue events: Container is shutting down.`);
    const { queueConsumer } = loadQnats();
    return queueConsumer.subscribe(this.streamId, this.queueId, handler, concurrency).then(subscription => {
      this.subscription = subscription;
      return subscription;
    });
  }

  status() {
    if (isShuttingDown()) throw new Error(`Cannot check queue status: Container is shutting down.`);
    const { queueProducer } = loadQnats();
    return queueProducer.queues.status(this.streamId, this.queueId);
  }
}

module.exports = (clientId, polyCustom) => queues.reduce(
  (acc, [path, id, streamId, queueId, ordered, compress, checksum, durability]) =>
    set(acc, path, new QueueQnats(id, path, streamId, queueId, ordered, compress, checksum, durability, clientId, polyCustom)),
  {}
);