import React from 'react';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: any) {
        // TODO: send to logging endpoint
        // console.error('ErrorBoundary caught', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 24 }}>
                    <h2>Something went wrong</h2>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error && this.state.error.message)}</div>
                    <div style={{ marginTop: 12 }}>
                        <button onClick={() => window.location.reload()} className="p-2 border rounded">Reload</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
