export class DbValidationError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'DbValidationError';
    this.code = code;
  }
}
