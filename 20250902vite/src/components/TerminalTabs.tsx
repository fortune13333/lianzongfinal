import React from 'react';
import { Device } from '../types';
import { useStore } from '../store/useStore';
import { PlusIcon } from './AIIcons';

interface TerminalTabsProps {
    openDevices: (Device | undefined)[];
    activeDeviceId: string | null;
    onShowDashboard: () => void;
}

const TerminalTabs: React.FC<TerminalTabsProps> = ({ openDevices, activeDeviceId, onShowDashboard }) => {
    const setActiveDeviceTab = useStore(state => state.setActiveDeviceTab);
    const closeDeviceTab = useStore(state => state.closeDeviceTab);

    return (
        <div className="flex items-center border-b border-bg-800">
            <div className="flex-grow flex items-center space-x-1">
                {openDevices.map(device => device && (
                    <div
                        key={device.id}
                        onClick={() => setActiveDeviceTab(device.id)}
                        className={`flex items-center gap-2 px-4 py-2 border-b-2 cursor-pointer transition-colors duration-200 ${
                            activeDeviceId === device.id
                                ? 'border-primary-500 text-text-100 bg-bg-900'
                                : 'border-transparent text-text-400 hover:bg-bg-800/50'
                        }`}
                    >
                        <span className="text-sm font-medium">{device.name}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeDeviceTab(device.id);
                            }}
                            className="text-text-500 hover:text-text-100 rounded-full hover:bg-bg-700 p-0.5"
                            aria-label={`Close tab for ${device.name}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
            <button 
                onClick={onShowDashboard}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-bg-800 text-text-400 hover:text-primary-400 transition-colors flex items-center gap-1"
                aria-label="Open new device tab"
                title="打开新设备"
            >
                <PlusIcon className="h-4 w-4" />
                <span>打开新设备</span>
            </button>
        </div>
    );
};

export default TerminalTabs;