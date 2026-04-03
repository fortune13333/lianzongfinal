import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import DeviceDetails from './DeviceDetails';

const TerminalContainer: React.FC = () => {
    const { devices, openDeviceIds, activeDeviceId } = useStore(state => ({
        devices: state.devices,
        openDeviceIds: state.openDeviceIds,
        activeDeviceId: state.activeDeviceId,
    }));

    const openDevices = useMemo(() => {
        const deviceMap = new Map(devices.map(d => [d.id, d]));
        return openDeviceIds.map(id => deviceMap.get(id)).filter(Boolean);
    }, [devices, openDeviceIds]);

    return (
        <div className="h-full relative overflow-hidden">
            {openDevices.map(device => (
                device && <DeviceDetails
                    key={device.id}
                    device={device}
                    isActive={device.id === activeDeviceId}
                />
            ))}
        </div>
    );
};

export default TerminalContainer;