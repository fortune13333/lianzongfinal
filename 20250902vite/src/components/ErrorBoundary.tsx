import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  // State is initialized as a class property, which is the modern approach
  // and avoids potential issues with `this` context in constructors.
  state: State = {
    hasError: false,
    error: undefined,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    const { hasError, error } = this.state;
    // FIX: Corrected a syntax error in destructuring assignment. The 'of' keyword is invalid for object destructuring.
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-bg-950 text-text-300 flex flex-col items-center justify-center p-4">
          <div className="bg-bg-900 border border-red-500/30 rounded-lg p-8 max-w-lg text-center shadow-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl font-bold text-text-100 mb-2">糟糕，应用出错了</h1>
            <p className="text-text-400 mb-6">
              我们遇到了一个意料之外的渲染错误。刷新页面可能会解决这个问题。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              刷新页面
            </button>
            {error && (
              <details className="mt-6 text-left text-xs text-text-500">
                <summary className="cursor-pointer hover:text-text-300">错误详情</summary>
                <pre className="mt-2 bg-bg-950 p-2 rounded-md overflow-auto">
                  <code>{error.stack}</code>
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
