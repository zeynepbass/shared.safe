// Thrown when a change would break the group's rules. `code` is stable and safe to switch on.
export class ValidationError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'ValidationError';
    this.code = code;
  }
}
