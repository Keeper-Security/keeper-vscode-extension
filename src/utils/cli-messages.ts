export const CLI_INFO_MESSAGES = {
  SAVING_SECRET: 'Saving secret to keeper vault...',
  GENERATING_PASSWORD: 'Generating password...',
  RETRIEVING_FOLDERS: 'Retrieving folders...',
  RETRIEVING_SECRETS: 'Retrieving secrets...',
  RETRIEVING_SECRET_DETAILS: 'Retrieving secret details...',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
  NO_FIELDS_TO_SHOW: 'No renderable fields. Field list is empty or only contains object-type values that were excluded from display.',
  QUICK_PICK_FOR_PERMISSION_MODEL_TITLE: 'Select permission model',
  QUICK_PICK_FOR_PERMISSION_MODEL_PLACEHOLDER: 'Choose how the new record should be created in My Vault',
  DETECTING_KEEPER_CLIS: 'Detecting Keeper CLIs...',
  QUICK_PICK_FOR_KEEPER_CLI_TITLE: 'Switch Keeper CLI',
  QUICK_PICK_FOR_KEEPER_CLI_PLACEHOLDER: 'Choose the Keeper CLI to use. Each one has its own login and vault.',
  CURRENT_KEEPER_CLI: 'Current',
  KEEPER_CLI_PATH_OVERRIDES_SELECTION:
    'keeper-security.cli.path is set and overrides this choice. Clear that setting to use the CLI you picked.',
} as const;

export const CLI_SUCCESS_MESSAGES = {
  NO_RECORDS_FOUND: 'No records found in vault. Please create a new record first.',
} as const;

export const CLI_ERROR_MESSAGES = {
  NO_VALUE_FOUND_TO_SAVE: 'Please make a text selection to save its value in the keeper vault.',
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  FAILED_TO_GET_VALUE: 'Failed to get value from Keeper Commander',
  FAILED_TO_RUN_SECURELY: 'Failed to execute command with secrets injected',
  FAILED_TO_GENERATE_PASSWORD: 'Failed to generate password',
  FAILED_TO_CHOOSE_FOLDER: 'Failed to choose folder',
  FAILED_TO_SAVE_SECRET: 'Failed to save secret',
  FAILED_TO_SWITCH_TO_KSM: 'Failed to switch to KSM mode',
  FAILED_TO_SWITCH_KEEPER_CLI: 'Failed to switch Keeper CLI',
  INVALID_COMMANDER_ARGUMENT:
    'Invalid Keeper Commander argument: control characters are not allowed.',
  INVALID_COMMANDER_RECORD_ADD_VALUE:
    'Value contains characters that are not allowed in Keeper Commander record fields (control characters).',
  INVALID_COMMANDER_RECORD_UID: 'Invalid Keeper record UID.',
} as const;

export const CLI_LOGGER_DEBUG_MESSAGES = {
  USER_CANCELLED_RECORD_SELECTION: 'User cancelled while selecting record',
  USER_CANCELLED_FIELD_SELECTION: 'User cancelled while selecting field',
  USER_SELECTED_RECORD: 'User selected record with UID',
  NO_RECORDS_FOUND: 'No records found',
  NO_RECORD_DATA_FOUND_FOR_RECORD_UID: 'No record data found for record UID',
  USER_CANCELLED_RECORD_NAME_INPUT: 'User cancelled while entering record name',
  USER_CANCELLED_PERMISSION_MODEL_SELECTION: 'User cancelled while selecting permission model',
  ENSURING_VALID_STORAGE: 'Ensuring valid storage',
  SYNCING_DOWN_LATEST_RECORDS_FROM_VAULT: 'Syncing down latest records from vault',
  EXECUTING_LIST_COMMAND_TO_GET_AVAILABLE_RECORDS: 'Executing list command to get available records',
  RETRIEVED_RECORDS_FROM_VAULT: 'Retrieved records from vault',
  RETRIEVED_RECORD_DETAILS: 'Retrieved record details',
  NO_VALUE_FOUND_TO_SAVE: 'Please make a text selection to save its value in the keeper vault.',
  USER_CANCELLED_KEEPER_CLI_SELECTION: 'User cancelled while selecting Keeper CLI',
  KEEPER_CLI_SETTINGS_CHANGED: 'Keeper CLI settings changed; the shell restarts on the next Keeper action',
  SAVED_FOLDER_BELONGS_TO_ANOTHER_CLI: 'Saved folder belongs to a different Keeper CLI (another vault); clearing it',
} as const;

export const CLI_LOGGER_ERROR_MESSAGES = {
  CLI_NOT_READY: 'Keeper Commander is not ready',
  FAILED_TO_CREATE_KEEPER_REFERENCE: 'Failed to create keeper reference for secret',
  SOMETHING_WENT_WRONG: 'Something went wrong',
} as const;