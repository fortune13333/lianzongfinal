// DeviceIcon.tsx - SVG icon for a device type (Router / Switch / Firewall).

import React from 'react';
import { Device } from '../types';

const ICON_PATHS: Record<Device['type'], string> = {
  Router: "M13 10V3L4 14h7v7l9-11h-7z",
  Switch: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  Firewall: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

interface DeviceIconProps {
  type: Device['type'];
  className?: string;
}

const DeviceIcon: React.FC<DeviceIconProps> = ({ type, className = "h-8 w-8" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} text-primary-400`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[type]} />
  </svg>
);

export default DeviceIcon;
