// src/components/pdf-editor/PdfEditorApp.tsx
// Top-level shell for the PDF editor. Owns the overall layout, the autosave
// lifecycle, keyboard shortcuts, and the two modal dialogs that are used
// app-wide (grid style + signature). Everything else reads/writes from the
// store directly.

"use client";

import React, { useEffect, useState } from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import {
startAutosave,
stopAutosave,
flushAutosave,
} from "@/lib/pdf-editor/autosave";
import { useEditorShortcuts } from "@/lib/pdf-editor/shortcuts";
import { Toolbar } from "./Toolbar";
import { ToolRail } from "./ToolRail";
import { ThumbnailSidebar } from "./ThumbnailSidebar";
import { PageViewport } from "./PageViewport";
import { PropertiesPanel } from "./PropertiesPanel";
import { StatusBar } from "./StatusBar";
import { GridStyleDialog } from "./GridStyleDialog";
import { SignatureDialog } from "./SignatureDialog";
import { FindReplaceBar } from "./FindReplaceBar";
import { PageOverlays } from "./PageOverlays";

export function PdfEditorApp() {
useEditorShortcuts();

const [gridDialogOpen, setGridDialogOpen] = useState(false);
const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
const [overlaysOpen, setOverlaysOpen] = useState(false);

useEffect(() => {
    const handler = () => setOverlaysOpen(true);
    window.addEventListener("pdf-editor:open-page-overlays", handler);
    return () =>
    window.removeEventListener("pdf-editor:open-page-overlays", handler);
}, []);

useEffect(() => {
startAutosave();
return () => {
void flushAutosave();
stopAutosave();
};
}, []);

const propertiesOpen = usePdfEditor((s) => s.propertiesOpen);
const setPropertiesOpen = usePdfEditor((s) => s.setPropertiesOpen);
const activeTool = usePdfEditor((s) => s.activeTool);
const selectTool = usePdfEditor((s) => s.selectTool);

// When the user picks the "signature" tool, we intercept and open the
// signature dialog instead of leaving them in a dead-end "click the page".
useEffect(() => {
if (activeTool === "signature") {
setSignatureDialogOpen(true);
selectTool("select");
}
}, [activeTool, selectTool]);

return (
<div className="h-screen w-full flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden">
<Toolbar
    onGridDialog={() => setGridDialogOpen(true)}
    onToggleProperties={() => setPropertiesOpen(!propertiesOpen)}
    propertiesOpen={propertiesOpen}
/>

<div className="flex-1 flex min-h-0">
    <ToolRail />
    <ThumbnailSidebar />
    <div className="flex-1 min-w-0 min-h-0">
    <PageViewport />
    </div>
    {propertiesOpen && <PropertiesPanel />}
</div>

        <StatusBar />

    <FindReplaceBar />
    <PageOverlays open={overlaysOpen} onOpenChange={setOverlaysOpen} />

    <GridStyleDialog open={gridDialogOpen} onOpenChange={setGridDialogOpen} />
<SignatureDialog
    open={signatureDialogOpen}
    onOpenChange={setSignatureDialogOpen}
/>
</div>
);
}
