import React from 'react';
import { toast, Toast } from 'react-hot-toast';
import Loader from './Loader';
import { CheckCircleSolid, XCircleSolid } from './AIIcons';

export interface ProgressStep {
    text: string;
    status: 'pending' | 'loading' | 'done' | 'error';
}

interface ProgressToastProps {
    t: Toast; // Toast object from react-hot-toast
    title: string;
    steps: ProgressStep[];
    onCancel?: () => void;
}

const StepIcon: React.FC<{ status: ProgressStep['status'] }> = ({ status }) => {
    const isStepLoading = status === 'loading';
    
    // A subtle pulsing dot for the step that is currently loading
    if (isStepLoading) {
        return <div className="h-5 w-5 flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse"></div></div>;
    }

    switch (status) {
        case 'done':
            return <CheckCircleSolid className="h-5 w-5 text-emerald-500" />;
        case 'error':
            return <XCircleSolid className="h-5 w-5 text-red-500" />;
        case 'pending':
        default:
            return <div className="h-5 w-5 flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-bg-600"></div></div>;
    }
}

const ProgressToast: React.FC<ProgressToastProps> = ({ t, title, steps, onCancel }) => {
    const isProcessRunning = steps.some(s => s.status === 'loading');
    
    return (
        <div 
            className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-bg-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-bg-700`}
        >
            <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                        {isProcessRunning && <Loader />}
                    </div>
                    <div className="ml-3 flex-1">
                        <p className="text-sm font-medium text-text-100">{title}</p>
                        <ul className="mt-2 space-y-2">
                            {steps.map((step, index) => (
                                <li key={index} className="flex items-center gap-3 text-sm">
                                    <StepIcon status={step.status} />
                                    <span className={
                                        step.status === 'pending' ? 'text-text-400' : 
                                        step.status === 'error' ? 'text-red-400' : 'text-text-200'
                                    }>
                                        {step.text}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="flex flex-col border-l border-bg-700">
                {onCancel && isProcessRunning && (
                     <button
                        onClick={onCancel}
                        className="w-full border-b border-bg-700 p-3 flex items-center justify-center text-sm font-medium text-red-500 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        取消
                    </button>
                )}
                <button
                    onClick={() => toast.dismiss(t.id)}
                    className="w-full p-3 flex items-center justify-center text-sm font-medium text-primary-500 hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    关闭
                </button>
            </div>
        </div>
    );
};

export default ProgressToast;