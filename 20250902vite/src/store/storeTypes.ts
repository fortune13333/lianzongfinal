// storeTypes.ts - Central type definitions for all Zustand store slices.
// Slice files import FullStore FROM this file; this file does NOT import from slices.

import {
  Device, Block, AppSettings, User, AuditLogEntry, ConfigTemplate, Policy,
  BackendSettings, DeploymentRecord, WriteToken, DeviceStatus, Script, ScheduledTask,
} from '../types';

// --- Slice Interfaces ---

export interface AuthSlice {
  currentUser: User | null;
  agentMode: 'live' | 'simulation';
  aiStatus: { isOk: boolean; message: string; code: string };
  init: () => void;
  login: (user: User, agentUrl: string) => void;
  logout: () => void;
}

export interface DataSlice {
  devices: Device[];
  allUsers: User[];
  auditLog: AuditLogEntry[];
  templates: ConfigTemplate[];
  policies: Policy[];
  deploymentHistory: DeploymentRecord[];
  writeTokens: WriteToken[];
  scripts: Script[];
  scheduledTasks: ScheduledTask[];
  blockchains: Record<string, Block[]>;
  isLoading: boolean;
  backendSettings: BackendSettings;
  fetchData: (isSilent?: boolean) => Promise<void>;
  resetData: () => Promise<void>;
}

export interface DeviceSlice {
  openDeviceIds: string[];
  activeDeviceId: string | null;
  deviceStatuses: Record<string, DeviceStatus>;
  _pollingIntervalId: ReturnType<typeof setInterval> | null;
  openDeviceTab: (deviceId: string) => void;
  closeDeviceTab: (deviceId: string) => void;
  setActiveDeviceTab: (deviceId: string) => void;
  addNewDevice: (deviceData: Omit<Device, 'ipAddress'> & { ipAddress: string; policyIds?: string[] }) => Promise<void>;
  updateDevice: (deviceId: string, deviceData: Omit<Device, 'ipAddress'> & { ipAddress: string; policyIds?: string[] }) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
  pollDeviceStatuses: () => Promise<void>;
  startStatusPolling: () => void;
  stopStatusPolling: () => void;
}

export interface UiSlice {
  settings: AppSettings;
  isSettingsModalOpen: boolean;
  isDeviceModalOpen: boolean;
  deviceToEdit: Device | null;
  isApiKeyModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openDeviceModalForAdd: () => void;
  openDeviceModalForEdit: (device: Device) => void;
  closeDeviceModal: () => void;
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  updateBackendAISettings: (newSettings: BackendSettings) => Promise<void>;
  addAgentUrlToHistory: (url: string) => void;
}

export interface SessionSlice {
  rollbackTarget: Block | null;
  isWriteStartupModalOpen: boolean;
  writeStartupDeviceId: string | null;
  promptRollback: (targetBlock: Block) => void;
  cancelRollback: () => void;
  executeRollback: () => Promise<void>;
  saveSessionAndAudit: (deviceId: string, sessionId: string) => Promise<void>;
  openWriteStartupModal: (deviceId: string) => void;
  closeWriteStartupModal: () => void;
  executeWriteStartup: (deviceId: string, token: string) => Promise<void>;
}

export interface ScriptSlice {
  createScript: (script: Script) => Promise<void>;
  updateScript: (scriptId: string, script: Script) => Promise<void>;
  deleteScript: (scriptId: string) => Promise<void>;
}

export interface TaskSlice {
  createScheduledTask: (task: ScheduledTask) => Promise<void>;
  updateScheduledTask: (taskId: string, task: ScheduledTask) => Promise<void>;
  deleteScheduledTask: (taskId: string) => Promise<void>;
}

// FullStore is the union of all slices — used as the generic for StateCreator in slice files.
export type FullStore = AuthSlice & DataSlice & DeviceSlice & UiSlice & SessionSlice & ScriptSlice & TaskSlice;
