"use client";

import { Component } from "react";
import { Button } from "./button";

interface Props {
  children: React.ReactNode;
  /** Shown instead of the children after a render error; `reset` re-mounts them. */
  fallback?: (reset: () => void) => React.ReactNode;
  /** Changing this re-mounts the children (e.g. new data arrived). */
  resetKey?: unknown;
}

/** Contains a render error to one part of the page (a row, a panel) instead of the whole app. */
export class ErrorBoundary extends Component<Props, { failed: boolean; key: unknown }> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  reset = () => this.setState({ failed: false });

  override render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ? (
      this.props.fallback(this.reset)
    ) : (
      <RowError onRetry={this.reset} />
    );
  }
}

/** Compact in-row failure: keeps the rest of the feed usable. */
export function RowError({ onRetry, title }: { onRetry: () => void; title?: string }) {
  return (
    <div
      role="alert"
      className="bg-surface/60 mx-[max(4vw,16px)] flex flex-wrap items-center justify-between gap-3 rounded-md px-5 py-4"
    >
      <p className="text-body text-muted">
        {title ? <span className="font-bold text-white">{title}: </span> : null}
        This row couldn&apos;t be shown.
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
