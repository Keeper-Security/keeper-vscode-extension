export const EXTENSION_NAME = 'Keeper Security';
export const EXTENSION_ID = 'ks-vscode';
export const CONFIG_NAMESPACE = 'keeper-security';

const makeCommand = (command: string): string => `${EXTENSION_ID}.${command}`;

export const COMMANDS = {
  AUTHENTICATE: makeCommand('authenticate'),
  SAVE_VALUE_TO_VAULT: makeCommand('saveValueToVault'),
  GET_VALUE_FROM_VAULT: makeCommand('getValueFromVault'),
  GENERATE_PASSWORD: makeCommand('generatePassword'),
  RUN_SECURELY: makeCommand('runSecurely'),
  CHOOSE_FOLDER: makeCommand('chooseFolder'),
  OPEN_LOGS: makeCommand('openLogs'),
  SWITCH_TO_CLI: makeCommand('switchToCli'),
  SWITCH_TO_KSM: makeCommand('switchToKsm'),
};

export const KEEPER_NOTATION_PATTERNS = {
  BASIC: /^keeper:\/\/([^\/]+)\/(type|title|notes)$/,
  FILE: /^keeper:\/\/([^\/]+)\/file\/([^\/\[\]]+)$/,
  FIELD:
    /^keeper:\/\/([^\/]+)\/(field|custom_field)\/([^\/\[\]]+)(?:\[([^\]]*)\])?(?:\[([^\]]*)\])?$/,
};

export const KEEPER_COMMANDER_DOCS_URLS = {
  INSTALLATION:
    'https://docs.keeper.io/en/keeperpam/commander-cli/commander-installation-setup',
  AUTHENTICATION:
    'https://docs.keeper.io/en/keeperpam/commander-cli/commander-installation-setup/logging-in',
} as const;

export const HELPER_MESSAGES = {
  OPEN_INSTALLATION_DOCS: 'Open Installation Documentation',
  OPEN_AUTHENTICATION_DOCS: 'Open Authentication Documentation',
  CLI_NOT_INSTALLED:
    'Keeper Commander CLI is not installed. Please install it first.',
  CLI_NOT_AUTHENTICATED:
    'Keeper Commander CLI is not authenticated or session has timed out. Please enable persistent login or biometric authentication on this device and try again.',
  CLI_READY: 'Keeper Security Extension is ready to use!',
  SOMETHING_WENT_WRONG: 'Something went wrong. Please try again.',
} as const;

export enum KEEPER_NOTATION_FIELD_TYPES {
  CUSTOM_FIELD = 'custom_field',
  FIELD = 'field',
}

// Keeper Record Types (from Commander CLI)
export enum KEEPER_RECORD_TYPES {
  LOGIN = 'login',
  PASSWORD = 'password',
  NOTE = 'note',
  BANK_ACCOUNT = 'bankAccount',
  ADDRESS = 'address',
  PAYMENT_CARD = 'paymentCard',
  DRIVERS_LICENSE = 'driversLicense',
  BIRTH_CERTIFICATE = 'birthCertificate',
  PASSPORT = 'passport',
  SOCIAL_SECURITY = 'socialSecurity',
  WIRELESS_ROUTER = 'wirelessRouter',
  SERVER = 'server',
  DATABASE = 'database',
  API_KEY = 'apiKey',
  SSH_KEY = 'sshKey',
  ENCRYPTION_KEY = 'encryptionKey',
  SOFTWARE_LICENSE = 'softwareLicense',
  MEMBERSHIP = 'membership',
  PASSPORT_RECORD = 'passportRecord',
  SECURE_NOTE = 'secureNote',
  FILE = 'file',
  PAM_MACHINE = 'pamMachine',
  PAM_USER = 'pamUser',
  PAM_CONFIG = 'pamConfig',
  PAM_GATEWAY = 'pamGateway',
  PAM_APP = 'pamApp',
  PAM_ROTATION = 'pamRotation',
  PAM_CONNECTION = 'pamConnection',
  PAM_TUNNEL = 'pamTunnel',
  PAM_SHARE = 'pamShare',
  PAM_APP_SHARE = 'pamAppShare',
  PAM_APP_ROTATION = 'pamAppRotation',
  PAM_APP_CONNECTION = 'pamAppConnection',
  PAM_APP_TUNNEL = 'pamAppTunnel',
  PAM_APP_SHARE_ROTATION = 'pamAppShareRotation',
  PAM_APP_SHARE_CONNECTION = 'pamAppShareConnection',
  PAM_APP_SHARE_TUNNEL = 'pamAppShareTunnel',
  PAM_APP_ROTATION_CONNECTION = 'pamAppRotationConnection',
  PAM_APP_ROTATION_TUNNEL = 'pamAppRotationTunnel',
  PAM_APP_CONNECTION_TUNNEL = 'pamAppConnectionTunnel',
  PAM_APP_SHARE_ROTATION_CONNECTION = 'pamAppShareRotationConnection',
  PAM_APP_SHARE_ROTATION_TUNNEL = 'pamAppShareRotationTunnel',
  PAM_APP_SHARE_CONNECTION_TUNNEL = 'pamAppShareConnectionTunnel',
  PAM_APP_ROTATION_CONNECTION_TUNNEL = 'pamAppRotationConnectionTunnel',
  PAM_APP_SHARE_ROTATION_CONNECTION_TUNNEL = 'pamAppShareRotationConnectionTunnel',
}

// Keeper Field Types (from Commander CLI)
export enum KEEPER_FIELD_TYPES {
  // Basic Types
  TEXT = 'text',
  PASSWORD = 'password',
  URL = 'url',
  EMAIL = 'email',
  LOGIN = 'login',
  NOTE = 'note',
  MULTILINE = 'multiline',
  SECRET = 'secret',
  ONETIME_CODE = 'oneTimeCode',

  // Complex Types
  HOST = 'host',
  ADDRESS = 'address',
  PHONE = 'phone',
  NAME = 'name',
  SECURITY_QUESTION = 'securityQuestion',
  PAYMENT_CARD = 'paymentCard',
  BANK_ACCOUNT = 'bankAccount',
  KEY_PAIR = 'keyPair',

  // Special Types
  FILE = 'file',
  DATE = 'date',

  // PAM Specific
  PAM_HOSTNAME = 'pamHostname',
  PAM_USERNAME = 'pamUsername',
  PAM_PASSWORD = 'pamPassword',
  PAM_CONFIG = 'pamConfig',
  PAM_GATEWAY = 'pamGateway',
  PAM_APP = 'pamApp',
  PAM_ROTATION = 'pamRotation',
  PAM_CONNECTION = 'pamConnection',
  PAM_TUNNEL = 'pamTunnel',
  PAM_SHARE = 'pamShare',
  PAM_APP_SHARE = 'pamAppShare',
  PAM_APP_ROTATION = 'pamAppRotation',
  PAM_APP_CONNECTION = 'pamAppConnection',
  PAM_APP_TUNNEL = 'pamAppTunnel',
  PAM_APP_SHARE_ROTATION = 'pamAppShareRotation',
  PAM_APP_SHARE_CONNECTION = 'pamAppShareConnection',
  PAM_APP_SHARE_TUNNEL = 'pamAppShareTunnel',
  PAM_APP_ROTATION_CONNECTION = 'pamAppRotationConnection',
  PAM_APP_ROTATION_TUNNEL = 'pamAppRotationTunnel',
  PAM_APP_CONNECTION_TUNNEL = 'pamAppConnectionTunnel',
  PAM_APP_SHARE_ROTATION_CONNECTION = 'pamAppShareRotationConnection',
  PAM_APP_SHARE_ROTATION_TUNNEL = 'pamAppShareRotationTunnel',
  PAM_APP_SHARE_CONNECTION_TUNNEL = 'pamAppShareConnectionTunnel',
  PAM_APP_ROTATION_CONNECTION_TUNNEL = 'pamAppRotationConnectionTunnel',
  PAM_APP_SHARE_ROTATION_CONNECTION_TUNNEL = 'pamAppShareRotationConnectionTunnel',
}

// Field Sets (for Commander CLI syntax)
export enum KEEPER_FIELD_SETS {
  FIELD = 'f',
  CUSTOM = 'c',
}

// Common field patterns for detection
export const FIELD_PATTERNS = {
  PASSWORD: /password|passwd|pwd|secret|key/i,
  URL: /url|uri|link|endpoint|api_url|webhook/i,
  EMAIL: /email|mail|e-mail/i,
  LOGIN: /login|username|user|account/i,
  API_KEY: /api_key|apikey|token|access_key|secret_key/i,
  DATABASE: /database|db|connection_string|dsn/i,
  HOST: /host|hostname|server|domain/i,
  PHONE: /phone|mobile|tel|telephone/i,
  ADDRESS: /address|street|city|state|zip/i,
  NAME: /name|first|last|middle|full_name/i,
} as const;

export const DOTENV_LINE =
  /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^\n\r#]+)?\s*(?:#.*)?$/;

export const RELOAD_WINDOW = 'Reload Window';

export enum KSM_METHOD_TYPES {
  ONE_TIME_TOKEN = 'One Time Access Token',
  BASE64 = 'Base64 Encoded',
  JSON_CONFIG = 'JSON Config File Path',
}

export const KSM_CONFIG_FILE_NAME = 'ksm-config.json';

export const BASE_HANDLER_MESSAGES = {
  LOGGER_DEBUG: {
    STARTING_STORAGE_VALIDATION: 'Starting storage validation',
    GET_RECORD_NAME_FROM_USER: 'Prompting user to enter record name',
    GET_RECORD_FIELD_NAME_FROM_USER:
      'Prompting user to enter record field name',
    NO_RECORD_NAME_PROVIDED: 'No record name provided by user',
    NO_RECORD_FIELD_NAME_PROVIDED: 'No record field name provided by user',
    USER_PROVIDED_RECORD_FIELD_NAME: 'User provided record field name',
    FIELD_MATCHED_TYPE: 'Field matched type',
    FIELD_DEFAULTED_TO_TYPE: 'Field defaulted to type',
    USING_CODELENS_VALUES: 'Using CodeLens values',
    USING_MANUAL_SELECTION_MODE: 'Using manual selection mode',
    NO_TEXT_SELECTED_BY_USER: 'No text selected by user',
    USER_SELECTED_TEXT: 'User selected text',
    INITIALIZING: 'Initializing',
    INSERTING_KEEPER_REFERENCE_IN_ACTIVE_TEXT_EDITOR:
      'Inserting keeper reference in active text editor',
    REPLACED_REFERENCE_IN_RANGE: 'Replaced reference in range',
    REPLACED_REFERENCE_IN_SELECTION: 'Replaced reference in selection',
    KEEPER_REFERENCE_INSERTED_SUCCESSFULLY:
      'Keeper reference inserted successfully',
    STARTING_WORKSPACE_SELECTION: 'Starting workspace selection',
    NO_WORKSPACE_FOLDERS_FOUND: 'No workspace folders found',
    SINGLE_WORKSPACE_FOUND: 'Single workspace found',
    MULTIPLE_WORKSPACES_FOUND: 'Multiple workspaces found',
    USER_CANCELLED_WORKSPACE_SELECTION: 'User cancelled workspace selection',
    USER_SELECTED_WORKSPACE_NOT_FOUND: 'User selected workspace not found',
    USER_SELECTED_WORKSPACE: 'User selected workspace',
    CURRENT_STORAGE: 'Current storage',
    NO_CURRENT_STORAGE_FOUND: 'No current storage found',
    CURRENT_STORAGE_IS_MY_VAULT: 'Current storage is My Vault',
    FOLDER_EXISTS_ON_KEEPER_VAULT: 'Folder exists on Keeper vault',
    CURRENT_STORAGE_EXISTS: 'Current storage exists',
    CURRENT_STORAGE_VALIDATION_FAILED: 'Current storage validation failed',
    USER_CHOSE_NOT_TO_SELECT_NEW_FOLDER: 'User chose not to select new folder',
    CURRENT_STORAGE_VALIDATION_SUCCESSFUL:
      'Current storage validation successful',
    STARTING_FOLDER_SELECTION_PROCESS: 'Starting folder selection process',
    NO_FOLDERS_AVAILABLE: 'No folders available',
    STORAGE_LOCATION_AUTOMATICALLY_SET_TO:
      'Storage location automatically set to',
    NO_FOLDER_SELECTED_BY_USER: 'No folder selected by user',
    USER_SELECTED_FOLDER: 'User selected folder',
    STORAGE_LOCATION_UPDATED_TO: 'Storage location updated to',
    RETRIEVED_CURRENT_STORAGE: 'Retrieved current storage',
    SETTING_CURRENT_STORAGE: 'Setting current storage',
  },
  LOGGER_INFO: {
    RESOLVED_ENVIRONMENT_VARIABLES: 'Resolved environment variables',
    FETCHING_RECORD: 'Fetching record',
    RESOLVED_SECRET: 'Resolved secret',
  },
  LOGGER_ERROR: {
    NO_ACTIVE_TEXT_EDITOR_FOUND:
      'No active text editor found. Cannot insert reference.',
    FAILED_TO_INSERT_KEEPER_REFERENCE: 'Failed to insert keeper reference',
    FAILED_TO_FIND_ENVIRONMENT_FILES: 'Failed to find environment files',
    FAILED_TO_RESOLVE_KEEPER_REFERENCE: 'Failed to resolve keeper reference',
    FAILED_TO_FETCH_RECORD: 'Failed to fetch record',
    FOLDER_NO_LONGER_EXISTS_ON_KEEPER_VAULT:
      'Folder no longer exists on Keeper vault',
  },
  INFO: {
    SECRET_SAVED_TO_KEEPER_VAULT: 'Secret saved to keeper vault',
    PASSWORD_GENERATED_AND_SAVED_TO_KEEPER_VAULT:
      'Password generated and saved to keeper vault',
    REFERENCE_OF_FIELD_OF_SECRET_RETRIEVED_SUCCESSFULLY:
      'Reference of field of secret retrieved successfully',
    RESOLVING_SECRETS: 'Resolving secrets...',
    COMMAND_STARTED_WITH_SECRETS_INJECTED:
      'Command started with secrets injected',
    VALIDATING_STORAGE: 'Validating storage...',
    RETRIEVING_FOLDERS: 'Retrieving folders...',
    STORAGE_LOCATION_AUTOMATICALLY_SET_TO:
      'Storage location automatically set to',
    STORAGE_LOCATION_SET_TO: 'Storage location set to',
  },
  ERROR: {
    NO_FILE_OPEN:
      'No file is open. Please open a file first to insert the reference.',
    FAILED_TO_INSERT_REFERENCE: 'Failed to insert reference. Please try again.',
    OPEN_FOLDER_OR_WORKSPACE_FIRST: 'Open a folder/workspace first',
    WORKSPACE_NOT_FOUND: 'Workspace not found',
    SELECTED_FILE_IS_NOT_AN_ENVIRONMENT_FILE:
      'Selected file is not an environment file. Must be a .env or .env.* file',
    FAILED_TO_PARSE_KEEPER_REFERENCE: 'Failed to parse keeper:// reference',
  },
  DEBUG: {},
  INPUT: {
    RECORD_NAME_FROM_USER_PROMPT: 'What do you want to call this record?',
    RECORD_NAME_FROM_USER_PLACEHOLDER:
      "Enter a name for this record. e.g. 'My Password'",
    RECORD_FIELD_NAME_FROM_USER_PROMPT:
      'What do you want to call this record field?',
    RECORD_FIELD_NAME_FROM_USER_PLACEHOLDER:
      "Enter a name for field. e.g. 'password'",
    QUICK_PICK_FOR_RECORDS_TITLE: 'Available records from Keeper Vault',
    QUICK_PICK_FOR_RECORDS_PLACEHOLDER: 'Select a record',
    QUICK_PICK_FOR_SELECTED_RECORD_TITLE: 'Available fields from record',
    QUICK_PICK_FOR_SELECTED_RECORD_PLACEHOLDER:
      'Which field do you want to retrieve?',
    SELECT_WORKSPACE_TO_RUN_SECURELY_IN_PLACEHOLDER:
      'Select workspace to run securely in',
    SELECT_ENVIRONMENT_FILE_TO_USE_PLACEHOLDER:
      'Select environment file to use',
    SELECT_ENVIRONMENT_FILE_TO_USE_LABEL: 'Select Environment File',
    ENTER_COMMAND_TO_RUN_WITH_KEEPER_SECRETS_INJECTED_PROMPT:
      'Enter command to run with Keeper secrets injected',
    ENTER_COMMAND_TO_RUN_WITH_KEEPER_SECRETS_INJECTED_PLACEHOLDER:
      'e.g. node index.js',
    TERMINAL_NAME: 'Keeper Secure Run',
    PREVIOUSLY_SELECTED_FOLDER_IS_NO_LONGER_AVAILABLE:
      'Previously selected folder is no longer available. Would you like to choose a new folder?',
    QUICK_PICK_FOR_FOLDER_SELECTION_TITLE: 'Available folders',
    QUICK_PICK_FOR_FOLDER_SELECTION_PLACEHOLDER:
      'Select a folder to use as storage location while saving secrets',
  },
} as const;

export const PREVIOUS_USER_SELECTED_MODE_KEY = 'previousUserSelectedMode';
