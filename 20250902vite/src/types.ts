export interface Device {
  id: string;
  name: string;
  ipAddress: string;
  type: 'Router' | 'Switch' | 'Firewall';
  netmiko_device_type?: string;
  policyIds?: string[];
  tags?: string[];
}

export interface DeviceStatus {
  is_online: boolean;
  latency_ms: number | null;
  last_checked: string;
}

export interface ComplianceReport {
  overall_status: 'passed' | 'failed';
  results: {
    policy_id: string;
    policy_name: string;
    status: 'passed' | 'failed';
    details: string;
  }[];
}


export interface BlockData {
  deviceId: string;
  version: number;
  operator: string;
  config: string;
  diff: string;
  changeType: 'initial' | 'update' | 'rollback' | 'auto_audit';
  summary: string;
  analysis: any; // Can be string or object for old rollback data
  security_risks: string;
  compliance_report?: ComplianceReport;
  compliance_status?: 'passed' | 'failed';
  is_startup_config?: boolean;
}

export interface Block {
  index: number;
  timestamp: string;
  data: BlockData;
  prev_hash: string;
  hash: string;
}

export interface AIServiceSettings {
  enabled: boolean;
  apiUrl: string;
}

export interface AppSettings {
  ai: {
    analysis: {
      apiUrl: string;
    };
    commandGeneration: AIServiceSettings;
    configCheck: AIServiceSettings;
  };
  agentApiUrl: string;
  theme: string;
  bgTheme: string;
  agentUrlHistory: string[];
  dashboardViewMode?: 'grid' | 'list'; // New preference
}

export interface BackendSettings {
  is_ai_analysis_enabled: boolean;
  auto_audit_ai_analysis_mode?: 'best_effort' | 'disabled';
}

export interface User {
  id: number;
  username: string;
  password?: string; // Password should be optional on the frontend
  role: 'admin' | 'operator';
  extra_permissions?: string;
}

export interface SessionUser {
  username: string;
  sessionId: string;
}

export interface AuditLogEntry {
  timestamp: string;
  username: string;
  action: string;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  content: string;
}

export interface Policy {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  rule: string;
  enabled: boolean;
}

export interface DeploymentResult {
  device_id: string;
  device_name: string;
  status: 'success' | 'failure';
  message: string;
}

export interface DeploymentRecord {
  id: string;
  timestamp: string;
  operator: string;
  template_name: string;
  status: 'Completed' | 'Completed with Errors';
  summary: string;
  target_devices: string[];
  results: DeploymentResult[];
}

export interface WriteToken {
    id: number;
    token_value: string;
    created_by_admin: string;
    created_at: string;
    expires_at: string;
    is_used: boolean;
}

export interface Script {
  id: string;
  name: string;
  description?: string;
  content: string;
  device_type?: string;
  created_by?: string;
  created_at?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron_expr: string;
  task_type: 'backup' | 'config_pull';
  device_ids: string[];
  is_enabled: boolean;
  created_by?: string;
  created_at?: string;
  last_run?: string;
  last_status?: 'success' | 'error' | null;
}

export interface ScriptExecutionResult {
  device_id: string;
  device_name?: string;
  status: 'success' | 'error';
  output: string;
}

export interface ConfigSearchResult {
  device_id: string;
  block_index: number;
  timestamp: string;
  hash: string;
  version?: number;
  matched_lines: string[];
}
