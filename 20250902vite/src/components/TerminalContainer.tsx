import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import DeviceDetails from './DeviceDetails';
import TerminalTabs from './TerminalTabs';
import Dashboard from './Dashboard';

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

    const [showDashboard, setShowDashboard] = useState(false);

    return (
        <>
            <div className="h-full flex flex-col gap-4">
                <TerminalTabs 
                    openDevices={openDevices}
                    activeDeviceId={activeDeviceId}
                    onShowDashboard={() => setShowDashboard(true)}
                />
                <div className="flex-grow relative overflow-hidden min-h-0">
                    {openDevices.map(device => (
                        device && <DeviceDetails 
                            key={device.id} 
                            device={device} 
                            isActive={device.id === activeDeviceId}
                        />
                    ))}
                </div>
            </div>

            {showDashboard && (
                <div className="fixed inset-0 bg-bg-950 z-50 overflow-y-auto">
                    <div className="container mx-auto p-4 md:p-8">
                        <button 
                            onClick={() => setShowDashboard(false)}
                            className="text-sm text-primary-400 hover:text-primary-300 mb-4"
                        >
                            &larr; 返回终端视图
                        </button>
                        <Dashboard isInTerminalContext={true} />
                    </div>
                </div>
            )}
        </>
    );
};

export default TerminalContainer;