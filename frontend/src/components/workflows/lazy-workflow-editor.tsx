"use client";

import dynamic from "next/dynamic";
import type * as WorkflowEditorModule from "./workflow-editor";

export const LazyWorkflowEditor = dynamic<React.ComponentProps<typeof WorkflowEditorModule.WorkflowEditor>>(
  () => import("./workflow-editor").then((m) => m.WorkflowEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center rounded-2xl border border-border bg-surface/60 text-sm text-muted">
        Loading workflow editor...
      </div>
    ),
  },
);
