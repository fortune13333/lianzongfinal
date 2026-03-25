import { Device, Block } from './types';

export const INITIAL_DEVICES: Device[] = [
  { id: 'RTR01-NYC', name: 'Core Router NYC', ipAddress: '192.168.1.1', type: 'Router' },
  { id: 'SW01-SFO', name: 'Access Switch SFO', ipAddress: '10.10.5.254', type: 'Switch' },
  { id: 'FW01-LON', name: 'Edge Firewall London', ipAddress: '203.0.113.1', type: 'Firewall' },
];

export const GENESIS_BLOCKS: Record<string, Block[]> = {
  'RTR01-NYC': [
    {
      index: 0,
      timestamp: '2023-01-01T10:00:00Z',
      data: {
        deviceId: 'RTR01-NYC',
        version: 1,
        operator: 'system_init',
        config: `hostname RTR01-NYC
!
interface GigabitEthernet0/0
 ip address 192.168.1.1 255.255.255.0
 no shutdown
!
router ospf 1
 network 192.168.1.0 0.0.0.255 area 0
!
end`,
        diff: `+ hostname RTR01-NYC
+ !
+ interface GigabitEthernet0/0
+  ip address 192.168.1.1 255.255.255.0
+  no shutdown
+ !
+ router ospf 1
+  network 192.168.1.0 0.0.0.255 area 0
+ !
+ end`,
        changeType: 'initial',
        summary: '初始系统配置。',
        analysis: '这是设备的第一个配置区块，用于建立基线。',
        security_risks: '无。这是一个标准的初始设置。',
      },
      prev_hash: '0',
      hash: '4a58241e383de98ce0cc38a84a63a5d0fbb8daf9cb8607f96bca9bdbfbc1b04a',
    },
  ],
  'SW01-SFO': [
    {
      index: 0,
      timestamp: '2023-01-02T11:30:00Z',
      data: {
        deviceId: 'SW01-SFO',
        version: 1,
        operator: 'system_init',
        config: `hostname SW01-SFO
!
vlan 10
 name USERS
!
interface FastEthernet0/1
 switchport mode access
 switchport access vlan 10
!
end`,
        diff: `+ hostname SW01-SFO
+ !
+ vlan 10
+  name USERS
+ !
+ interface FastEthernet0/1
+  switchport mode access
+  switchport access vlan 10
+ !
+ end`,
        changeType: 'initial',
        summary: '初始系统配置。',
        analysis: '这是设备的第一个配置区块，用于建立基线。',
        security_risks: '无。这是一个标准的初始设置。',
      },
      prev_hash: '0',
      hash: '8525b6999335f60b45d06456f43702951b1a43a75871f3014a6e35591e1d318e',
    },
  ],
  'FW01-LON': [
    {
      index: 0,
      timestamp: '2023-01-03T09:00:00Z',
      data: {
        deviceId: 'FW01-LON',
        version: 1,
        operator: 'system_init',
        config: `hostname FW01-LON
!
ip access-list extended INCOMING_FILTER
 permit tcp any host 203.0.113.1 eq 443
 deny ip any any log
!
interface GigabitEthernet0/1
 ip access-group INCOMING_FILTER in
!
end`,
        diff: `+ hostname FW01-LON
+ !
+ ip access-list extended INCOMING_FILTER
+  permit tcp any host 203.0.113.1 eq 443
+  deny ip any any log
+ !
+ interface GigabitEthernet0/1
+  ip access-group INCOMING_FILTER in
+ !
+ end`,
        changeType: 'initial',
        summary: '初始系统配置。',
        analysis: '这是设备的第一个配置区块，用于建立基线。',
        security_risks: '无。这是一个标准的初始设置。',
      },
      prev_hash: '0',
      hash: '3650a3163351368a27d142b918738327b87c712852277d3257085a3c631e7845',
    },
  ],
};
