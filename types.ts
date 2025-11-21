
export interface Program {
  id: string;
  name: string;
  details: string;
  type: string;
  category: string;
  remarks?: string;
}

export interface Activity {
  id: string;
  title: string;
  subtitle?: string;
  details: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  programId: string;
  responseType?: string;
  category: string;
  status: 'Draft' | 'Published' | 'Archived';
  formDefinition?: FormDefinition;
}

export enum AnswerType {
  TEXT = 'textbox',
  DATE = 'date',
  TIME = 'time',
  DROPDOWN = 'dropdown',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  FILE = 'file', // Generic file upload within form
  COMPUTED = 'computed' // Computed / formula-driven field
}

export interface Question {
  id: string;
  activityId: string;
  fieldName?: string; // machine-friendly name editable by user and usable in formulas
  pageName: string; // Used for logical grouping if needed, but primarily linked via Section->Page
  sectionName: string;
  questionText: string;
  questionHelper?: string;
  answerType: AnswerType;
  options?: { label: string; value: string }[];
  category?: string;
  questionGroup?: string;
  columnSize: number; // Bootstrap 12-grid value: 12 (full), 6 (half), 4 (third), 3 (quarter)
  required?: boolean;
  metadata?: Record<string, any>;
  status: 'Active' | 'Inactive';
  createdBy: string;
}

export interface FormSection {
  id: string;
  name: string;
  questions: Question[];
}

export interface FormPage {
  id: string;
  name: string;
  sections: FormSection[];
}

export interface FormDefinition {
  id: string;
  activityId: string;
  pages: FormPage[];
}

export interface Answer {
  id?: string;
  questionId: string;
  answerValue: any;
  facilityId?: string;
  userId?: string;
  recordedBy?: string;
  answerDateTime?: string;
  reviewersComment?: string;
  qualityImprovementFollowup?: string;
  score?: number;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  data: Record<string, any>[]; // Array of objects representing rows
}

export interface ActivityReport {
  id: string;
  activityId: string;
  facilityId?: string; // If facility level
  userId?: string; // If user level
  feedbackDetails?: string;
  dataCollectionLevel: 'User' | 'Facility';
  status: 'Pending' | 'Reviewed' | 'Completed';
  score?: number;
  preparedBy: string; // User ID
  remarks?: string;
  answers: Record<string, any>; // Map of questionId -> value
  uploadedFiles?: UploadedFile[];
  submissionDate: string;
}

export interface Facility {
  id: string;
  name: string;
  state: string;
  lga: string;
  address: string;
  contactPerson?: string;
  category?: string;
  remarks?: string;
}

export type UserRole = 'Admin' | 'Form Builder' | 'Data Collector' | 'Viewer' | 'Responder';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  email: string;
  password?: string;
  phoneNumber: string;
  about?: string;
  designation?: string;
  category?: string;
  facilityId?: string;
  profileImage?: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
}
