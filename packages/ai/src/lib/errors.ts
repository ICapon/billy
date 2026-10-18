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
