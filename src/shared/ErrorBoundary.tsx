import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icons } from "./ui";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--danger-color)" }}>
                    <Icons.Warning size={48} />
                    <h3>Something went wrong</h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", overflowWrap: "break-word" }}>
                        {this.state.error?.message}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "16px",
                            padding: "8px 16px",
                            background: "var(--primary-color)",
                            border: "none",
                            borderRadius: "8px",
                            color: "white",
                            cursor: "pointer",
                        }}
                    >
                        Reload Wallet
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
