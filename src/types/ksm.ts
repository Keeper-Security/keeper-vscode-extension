import { KEEPER_NOTATION_FIELD_TYPES } from "../utils/constants";

export interface IKsmGetSecretsResponse {
  appData: IAppData;
  records: IRecord[];
  expiresOn: string | undefined;
}

interface IRecord {
  recordUid: string;
  folderUid: string;
  data: {
    custom: IField[];
    fields: IField[];
    notes: string;
    title: string;
    type: string;
  };
}

interface IAppData {
  title: string;
  type: string;
}

export interface IField {
  label: string;
  type: string;
  value: string[] | number[];
}

export interface IRecordQuickPick {
  label: string;
  value: string;
}

export interface IRecordQuickPickWithFieldType extends IRecordQuickPick {
  fieldType: KEEPER_NOTATION_FIELD_TYPES;
}
