/** The file cannot be read at all (corrupted, password protected, empty). Retrying will not help. */
export class UnreadableFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableFileError';
  }
}

/** The configured processing cost limit was reached; the file waits in the queue. */
export class CostLimitReachedError extends Error {
  constructor(message = 'The processing cost limit has been reached') {
    super(message);
    this.name = 'CostLimitReachedError';
  }
}

/** Missing or invalid configuration (e.g. no API key): retrying the job cannot fix it. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** The chat spent its tool-iteration budget without reaching an answer. */
export class ChatTurnLimitError extends Error {
  constructor(message = 'The assistant could not finish the answer') {
    super(message);
    this.name = 'ChatTurnLimitError';
  }
}

/** The chat did not answer within the configured time. */
export class ChatTurnTimeoutError extends Error {
  constructor(message = 'The assistant took too long to answer') {
    super(message);
    this.name = 'ChatTurnTimeoutError';
  }
}
