# seed_data.py - Initial seed data for the ChainTrace database.
# Extracted from crud.py to keep fixture data separate from business logic.

from typing import Dict, Any

INITIAL_DATA_RAW: Dict[str, Any] = {
    "devices": [
        {"id": "RTR01-NYC", "name": "Core Router NYC", "ipAddress": "192.168.1.1", "type": "Router"},
        {"id": "SW01-SFO", "name": "Access Switch SFO", "ipAddress": "10.10.5.254", "type": "Switch"},
        {"id": "FW01-LON", "name": "Edge Firewall London", "ipAddress": "203.0.113.1", "type": "Firewall"},
    ],
    "users": [
        {"id": 1, "username": "admin", "password": "admin", "role": "admin"},
        {"id": 2, "username": "operator1", "password": "password", "role": "operator"},
        {"id": 3, "username": "net_admin", "password": "password123", "role": "operator"},
    ],
    "settings": {
        "is_ai_analysis_enabled": True,
        "auto_audit_ai_analysis_mode": "best_effort"
    },
    "blockchains": {
        "RTR01-NYC": [
            {
                "index": 0,
                "timestamp": "2023-01-01T10:00:00Z",
                "data": {
                    "deviceId": "RTR01-NYC", "version": 1, "operator": "system_init",
                    "config": "hostname RTR01-NYC\n!\ninterface GigabitEthernet0/0\n ip address 192.168.1.1 255.255.255.0\n no shutdown\n!\nrouter ospf 1\n network 192.168.1.0 0.0.0.255 area 0\n!\nend",
                    "diff": "+ hostname RTR01-NYC\n+ !\n+ interface GigabitEthernet0/0\n+  ip address 192.168.1.1 255.255.255.0\n+  no shutdown\n+ !\n+ router ospf 1\n+  network 192.168.1.0 0.0.0.255 area 0\n+ !\n+ end",
                    "changeType": "initial", "summary": "初始系统配置。",
                    "analysis": "这是设备的第一个配置区块，用于建立基线。",
                    "security_risks": "无。这是一个标准的初始设置。",
                    "compliance_report": {"overall_status": "passed", "results": []}
                },
                "prev_hash": "0"
            }
        ],
        "SW01-SFO": [
            {
                "index": 0,
                "timestamp": "2023-01-02T11:30:00Z",
                "data": {
                    "deviceId": "SW01-SFO", "version": 1, "operator": "system_init",
                    "config": "hostname SW01-SFO\n!\nvlan 10\n name USERS\n!\ninterface FastEthernet0/1\n switchport mode access\n switchport access vlan 10\n!\nend",
                    "diff": "+ hostname SW01-SFO\n+ !\n+ vlan 10\n+  name USERS\n+ !\n+ interface FastEthernet0/1\n+  switchport mode access\n+  switchport access vlan 10\n+ !\n+ end",
                    "changeType": "initial", "summary": "初始系统配置。",
                    "analysis": "这是设备的第一个配置区块，用于建立基线。",
                    "security_risks": "无。这是一个标准的初始设置。",
                    "compliance_report": {"overall_status": "passed", "results": []}
                },
                "prev_hash": "0"
            }
        ],
        "FW01-LON": [
            {
                "index": 0,
                "timestamp": "2023-01-03T09:00:00Z",
                "data": {
                    "deviceId": "FW01-LON", "version": 1, "operator": "system_init",
                    "config": "hostname FW01-LON\n!\nip access-list extended INCOMING_FILTER\n permit tcp any host 203.0.113.1 eq 443\n deny ip any any log\n!\ninterface GigabitEthernet0/1\n ip access-group INCOMING_FILTER in\n!\nend",
                    "diff": "+ hostname FW01-LON\n+ !\n+ ip access-list extended INCOMING_FILTER\n+  permit tcp any host 203.0.113.1 eq 443\n+  deny ip any any log\n+ !\n+ interface GigabitEthernet0/1\n+  ip access-group INCOMING_FILTER in\n+ !\n+ end",
                    "changeType": "initial", "summary": "初始系统配置。",
                    "analysis": "这是设备的第一个配置区块，用于建立基线。",
                    "security_risks": "无。这是一个标准的初始设置。",
                    "compliance_report": {"overall_status": "passed", "results": []}
                },
                "prev_hash": "0"
            }
        ],
    }
}
