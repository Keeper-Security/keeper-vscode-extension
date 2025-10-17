export const CLI_INFO_MESSAGES = {
  RETRIEVING_SECRETS: 'Retrieving secrets...',
  RETRIEVING_SECRET_DETAILS: 'Retrieving secret details...',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
} as const;

export const CLI_SUCCESS_MESSAGES = {
  NO_RECORDS_FOUND: 'No records found in vault. Please create a new record first.',
} as const;

export const CLI_ERROR_MESSAGES = {
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  FAILED_TO_GET_VALUE: 'Failed to get value from Keeper Commander',
  FAILED_TO_RUN_SECURELY: 'Failed to execute command with secrets injected',
} as const;

export const CLI_LOGGER_DEBUG_MESSAGES = {
  USER_CANCELLED_RECORD_SELECTION: 'User cancelled while selecting record',
  USER_CANCELLED_FIELD_SELECTION: 'User cancelled while selecting field',
  USER_SELECTED_RECORD: 'User selected record with UID',
  NO_RECORDS_FOUND: 'No records found',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
} as const;

export const CLI_LOGGER_ERROR_MESSAGES = {
  CLI_NOT_READY: 'Keeper Commander is not ready',
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  SOMETHING_WENT_WRONG: 'Something went wrong',
} as const;