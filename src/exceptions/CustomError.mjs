class CustomError extends Error {
  constructor(message, code = 500, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export default CustomError;
