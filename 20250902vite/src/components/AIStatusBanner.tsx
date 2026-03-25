import React from 'react';

interface AIStatusBannerProps {
  message: string;
  errorCode: string;
  onShowInstructions: () => void;
}

const AIStatusBanner: React.FC<AIStatusBannerProps> = ({ message, errorCode, onShowInstructions }) => {
  return (
    <div className="bg-red-900/80 backdrop-blur-sm text-red-200 p-3 text-center text-sm border-b border-red-700/50 shadow-lg" role="alert">
      <div className="container mx-auto flex items-center justify-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>
          <strong className="font-bold">AI 功能不可用：</strong> {message}
          <code className="ml-2 bg-red-800/50 text-red-100 px-1.5 py-0.5 rounded text-xs font-mono">{errorCode}</code>
        </span>
        <button
          onClick={onShowInstructions}
          className="ml-4 text-xs font-bold text-white underline hover:text-red-100 transition-colors"
        >
          如何修复?
        </button>
      </div>
    </div>
  );
};

export default AIStatusBanner;