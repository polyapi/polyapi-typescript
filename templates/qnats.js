
let shuttingDown = false;
const isShuttingDown = () => shuttingDown;

let natsConnection;
let queueConsumer;
let queueProducer;
let lockManager;
let qnatsLoadError;

const loadQnats = () => {
  if (shuttingDown) throw new Error('Cannot initialize queues and locks: Container is shutting down.');
  if (qnatsLoadError) {
    throw qnatsLoadError;
  }
  if (queueConsumer && lockManager && queueProducer) {
    return { queueConsumer, queueProducer, lockManager };
  }

  let QueueConsumer;
  let QueueProducer;
  let LockManager;
  let NatsConnection;
  try {
    ({ QueueProducer, QueueConsumer, LockManager, NatsConnection } = require('@polyapi/qnats'));
  } catch (error) {
    qnatsLoadError = error;
    throw error;
  }

  if (!process.env.NATS_URL) {
    qnatsLoadError = new Error('NATS_URL is not configured for queue consumers.');
    throw qnatsLoadError;
  }

  natsConnection = new NatsConnection({
    url: process.env.NATS_URL,
    credentials: process.env.NATS_USER
      ? {
          user: process.env.NATS_USER,
          pass: process.env.NATS_PASSWORD || '',
        }
      : undefined,
  });
  queueConsumer = new QueueConsumer({ nats: natsConnection });
  lockManager = new LockManager(natsConnection);
  queueProducer = new QueueProducer({ maxPayload: 1_048_576, chunkSize: 65_536 }, natsConnection);
  return { queueConsumer, queueProducer, lockManager };
};

const unloadQnats = () => {
  queueConsumer = null;
  lockManager = null;
  queueProducer = null;
  natsConnection.close(true).then(() => {
    natsConnection = null;
  });
}

const shutdown = () => {
  shuttingDown = true;
  unloadQnats();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

module.exports = {
  isShuttingDown,
  loadQnats,
  unloadQnats,
}