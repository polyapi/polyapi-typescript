
type Publishable = Readable | Buffer | string | object;

type PublishResult = {
  eventId: string;
};

type ListEventsPagination = {
  page?: number;
  pageSize?: number;
};

type ListEventsResult<T extends EventPayload = EventPayload> = {
  results: QueueEvent<T>[];
  pagination: {
    page: number;
    pages: number;
    pageSize: number;
    count: number;
  };
}

type QueueStatus = {
  pendingCount: number;
  byteSize: number;
  firstSeq: string;
  lastSeq: string;
};

type QueueEventStatus =
  | 'ready'
  | 'active'
  | 'complete'
  | 'aborted'
  | 'failed'
  | 'dead'
  | 'skipped';

type EventPayload = object | string | Buffer;

interface QueueEvent<T extends EventPayload = EventPayload> {
  id: string;
  status: QueueEventStatus;
  headers: Record<string, string>; // Any headers that came with the event
  createdAt: string; // ISO Timestamp
  claimedAt?: string; // ISO Timestamp
  lastHeartbeat?: string; // ISO Timestamp
  consumedAt?: string; // ISO Timestamp
  message?: string; // error if in error state, else custom message on completion
  retryCount?: number;
  // Refresh event metadata
  refresh(): Promise<void>;
  // Get the full event payload in memory for processing
  payload(): Promise<T | undefined>;
  // Get event payload as a readable stream
  streamPayload(decompress?: boolean): Readable;
  // Trigger heartbeat to show event is in progress
  heartbeat(): Promise<void>;
  // Complete the event with optional status (default is \'complete\') and optional message
  complete(status?: Exclude<QueueEventStatus, 'ready' | 'active' | 'skipped'>, message?: string): Promise<void>;
  // Use withEvent to get automatic lifecycle management including heartbeats
  withEvent<R>(fn: (event: QueueEvent<T>) => R | Promise<R>): Promise<R>
}

interface Subscription {
  unsubscribe: () => Promise<void>;
}

declare namespace queue {
  interface Queue {
    // Subscribe to multiple queues in order given
    // ex. ['A', 'B'] will pull events from A until it's empty, then will pull events from B
    subscribe(queueIds: string[], handler: (event: QueueEvent) => any, concurrency?: number): Promise<Subscription>;
  }
}