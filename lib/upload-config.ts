export const UPLOAD_MAX_FILE_MB = 25;
export const UPLOAD_MAX_FILE_BYTES = UPLOAD_MAX_FILE_MB * 1024 * 1024;
export const REPORT_MEDIA_MAX_FILES = 4;
// Allow a bounded multi-image report upload plus multipart metadata overhead.
export const SERVER_ACTION_BODY_SIZE_LIMIT = `${UPLOAD_MAX_FILE_MB * REPORT_MEDIA_MAX_FILES + 5}mb` as `${number}mb`;
