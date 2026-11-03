type LockOptions = {
  holdTimeout?: number; // 1+, number of seconds, default 300 (5 minutes)
  renewable?: boolean; // default true
  capacity?: number; // 1+, default 1, use capacity > 1 to make a semaphore
  expiresAt?: Date;
};

type LockStatus = {
  locked: boolean;
  count: number;
  // If lock has more than 1 capacity then this will be the expiration time of the oldest lock
  expiresAt: null | string;
};

interface Lock {
  getSessionId(): string;
  renew(): Promise<void>;
  release(): Promise<void>;
  check(): Promise<boolean>;
  withLock<T>(fn: (lock: Lock) => T | Promise<T>): Promise<T>;
}