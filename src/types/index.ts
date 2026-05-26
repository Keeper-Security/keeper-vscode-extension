import { KEEPER_NOTATION_FIELD_TYPES } from '../utils/constants';

export interface IFolder {
  folderUid: string;
  name: string;
  parentUid: string;
  folderPath?: string;
  source: string;
}

export interface ICliListFolderResponse {
  folder_uid: string;
  name: string;
  parent_uid: string;
  flags?: string;
}

export interface IKsmGetFoldersResponse {
  folderUid: string;
  name: string;
  parentUid?: string;
}

export interface ICurrentStorage {
  folderUid: string;
  name: string;
  parentUid: string;
  folderPath?: string;
}

export interface IField {
  type: string;
  label: string;
  value: string[];
  fieldType?: KEEPER_NOTATION_FIELD_TYPES;
}

export interface ICliListRecordResponse {
  record_uid: string;
  title: string;
  type: string;
  shared: string;
  record_category: string;
}

export interface ICliListFolderResponse {
  uid: string;
  name: string;
  // parent_uid: string; // this currenlty not used
  // flags?: string; // this currenlty not used
  details: string;
  source: string;
}

export interface ICliGetFolderResponse {
  folder_uid: string; // this attribute for KD-Folder's and classic non shared folder
  shared_folder_uid?: string; // this is required for shared folders response

  type?: string;
  name: string;
  parent_folder_uid?: string;
}

export enum ModeType {
  CLI = 'cli',
  KSM = 'ksm',
}

export type Mode = ModeType.CLI | ModeType.KSM;
