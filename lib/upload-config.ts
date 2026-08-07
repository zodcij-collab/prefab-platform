export const UPLOAD_MAX_FILE_MB = 25;
export const UPLOAD_MAX_FILE_BYTES = UPLOAD_MAX_FILE_MB * 1024 * 1024;
// Allow multipart metadata overhead while per-file validation enforces the actual limit.
export const SERVER_ACTION_BODY_SIZE_LIMIT = `${UPLOAD_MAX_FILE_MB + 5}mb` as `${number}mb`;
