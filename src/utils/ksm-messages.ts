export const KSM_INFO_MESSAGES = {
  AUTHENTICATING_WITH_KSM: 'Authenticating with Keeper Secrets Manager...',
  AUTHENTICATED_WITH_KSM: 'Keeper Secrets Manager authenticated successfully with new shared folder.',
  SAVING_SECRET: 'Saving secret to keeper vault...',
  GENERATING_PASSWORD: 'Generating password...',
  RETRIEVING_SECRETS: 'Retrieving secrets...',
  RETRIEVING_FOLDERS: 'Retrieving folders...',
  RETRIEVING_SECRET_DETAILS: 'Retrieving secret details...',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
} as const;

export const KSM_SUCCESS_MESSAGES = {
  NO_RECORDS_FOUND: 'No records found in vault. Please create a new record first.',
} as const;

export const KSM_ERROR_MESSAGES = {
  NO_VALUE_FOUND_TO_SAVE: 'Please make a text selection to save its value in the keeper vault.',
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  FAILED_TO_GET_VALUE: 'Failed to get value from Keeper Secrets Manager',
  FAILED_TO_RUN_SECURELY: 'Failed to execute command with secrets injected',
  FAILED_TO_AUTHENTICATE: 'Failed to authenticate with Keeper Secrets Manager',
  FAILED_TO_GENERATE_PASSWORD: 'Failed to generate password',
  FAILED_TO_CHOOSE_FOLDER: 'Failed to choose folder',
  FAILED_TO_SAVE_SECRET: 'Failed to save secret',
  FAILED_TO_SWITCH_TO_CLI: 'Failed to switch to CLI mode',
} as const;

export const KSM_LOGGER_DEBUG_MESSAGES = {
  USER_CANCELLED_RECORD_SELECTION: 'User cancelled while selecting record',
  USER_CANCELLED_FIELD_SELECTION: 'User cancelled while selecting field',
  USER_SELECTED_RECORD: 'User selected record with UID',
  NO_RECORDS_FOUND: 'No records found',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
  USER_CANCELLED_RECORD_NAME_INPUT: 'User cancelled while entering record name',
  NO_FOLDERS_FOUND: 'No folders found',
  ENSURING_VALID_STORAGE: 'Ensuring valid storage',
} as const;

export const KSM_LOGGER_ERROR_MESSAGES = {
  KSM_NOT_READY: 'Keeper Secrets Manager is not ready',
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  SOMETHING_WENT_WRONG: 'Something went wrong',
} as const;