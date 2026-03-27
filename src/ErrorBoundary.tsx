import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorWithJSX extends Error {
  jsx: ReactNode;

  constructor(message: string, jsx: ReactNode) {
    super(message);
    this.name = "ErrorWithJSX";
    this.jsx = jsx;
  }
}

export class ErrorBoundary extends Component<
  {
    fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode;
    children: ReactNode;
    resetOnChange?: any;
  },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  state: {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
  } = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentDidUpdate(prevProps: { resetOnChange?: any }) {
    // If resetOnChange prop changes while in error state, reset the error
    if (
      this.state.hasError &&
      this.props.resetOnChange !== prevProps.resetOnChange
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo!);
      }

      // Default dev-friendly error display
      const error = this.state.error;
      const isErrorWithJSX = error instanceof ErrorWithJSX;

      return (
        <div
          style={{
            border: "1px solid rgb(252, 165, 165)",
            background: "rgb(254, 242, 242)",
            borderRadius: 6,
            padding: 16,
            margin: 16,
            userSelect: "text",
            alignSelf: "flex-start",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: "rgb(153, 27, 27)",
                fontSize: "1.125rem",
              }}
            >
              Error: {error.message}
            </div>
            <button
              onClick={this.reset}
              style={{
                padding: "4px 12px",
                background: "rgb(220, 38, 38)",
                color: "white",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>

          {isErrorWithJSX && (
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              {(error as ErrorWithJSX).jsx}
            </div>
          )}

          {error.stack && (
            <details style={{ marginTop: 12 }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: "rgb(185, 28, 28)",
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Stack Trace
              </summary>
              <pre
                style={{
                  fontSize: "0.75rem",
                  background: "rgb(254, 226, 226)",
                  padding: 12,
                  borderRadius: 6,
                  overflowX: "auto",
                  color: "rgb(127, 29, 29)",
                  marginTop: 8,
                }}
              >
                {error.stack}
              </pre>
            </details>
          )}

          {this.state.errorInfo?.componentStack && (
            <details style={{ marginTop: 12 }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: "rgb(185, 28, 28)",
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Component Stack
              </summary>
              <pre
                style={{
                  fontSize: "0.75rem",
                  background: "rgb(254, 226, 226)",
                  padding: 12,
                  borderRadius: 6,
                  overflowX: "auto",
                  color: "rgb(127, 29, 29)",
                  marginTop: 8,
                }}
              >
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
