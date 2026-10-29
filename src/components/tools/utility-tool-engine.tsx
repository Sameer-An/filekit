"use client";
import React, { useState } from "react";
import JSZip from "jszip";
import * as yaml from "js-yaml";
import {
  Archive,
  FileCode,
  Hash,
  Braces,
  Table2,
  Code2,
  ScanSearch,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Download,
  File,
} from "lucide-react";
import { ToolDefinition } from "@/lib/tools-registry";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// FIX 1: Removed unused 'Label' import
import { ProcessingJob, createJob } from "@/lib/job-store";
import { formatBytes, calculateSHA256 } from "@/lib/utils";

// FIX 2: Custom type to access internal JSZip data without using 'any'
type JSZipInternalData = { uncompressedSize?: number };
type JSZipObjectWithData = JSZip.JSZipObject & { _data?: JSZipInternalData };

export function UtilityToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);

  // States
  const [zipEntries, setZipEntries] = useState<
    { name: string; size: number }[]
  >([]);
  const [hashResult, setHashResult] = useState<{
    sha256: string;
    sha1: string;
    size: number;
  } | null>(null);
  const [jsonText, setJsonText] = useState<string>(
    '{\n  "name": "FileKit",\n  "version": 1,\n  "tools": 61\n}',
  );
  const [yamlText, setYamlText] = useState<string>(
    "name: FileKit\nversion: 1\ntools: 61",
  );
  const [base64Text, setBase64Text] = useState<string>("");
  // FIX 3: Replaced 'any' with 'Record<string, unknown>'
  const [fileDetails, setFileDetails] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [zipFile, setZipFile] = useState<JSZip | null>(null);

  const isMulti = tool.id === "zip-create";

  const handleFiles = async (selected: File[]) => {
    setFiles(selected);
    if (selected.length > 0) {
      const f = selected[0];
      setJob(createJob(f.name, f.size));

      // ─── 1. ZIP EXTRACT ──────────────────────────────────────────────────
      if (tool.id === "zip-extract") {
        try {
          const zip = await JSZip.loadAsync(f);
          setZipFile(zip);
          const entries: { name: string; size: number }[] = [];
          zip.forEach((path, entry) => {
            if (!entry.dir) {
              // FIX 4: Used custom type instead of `any`
              const typedEntry = entry as JSZipObjectWithData;
              entries.push({
                name: path,
                size: typedEntry._data?.uncompressedSize || 0,
              });
            }
          });
          setZipEntries(entries);
        } catch {
          // ignore
        }
      }

      // ─── 2. FILE HASH ────────────────────────────────────────────────────
      else if (tool.id === "file-hash") {
        const ab = await f.arrayBuffer();
        const sha256 = await calculateSHA256(ab);
        const sha1Buf = await crypto.subtle.digest("SHA-1", ab);
        const sha1 = Array.from(new Uint8Array(sha1Buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setHashResult({ sha256, sha1, size: f.size });
      }

      // ─── 3. FILE METADATA ────────────────────────────────────────────────
      else if (tool.id === "file-metadata") {
        const slice = await f.slice(0, 16).arrayBuffer();
        const hex = Array.from(new Uint8Array(slice))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        setFileDetails({
          name: f.name,
          sizeBytes: f.size,
          sizeFormatted: formatBytes(f.size),
          mimeType: f.type || "Unknown MIME",
          lastModified: new Date(f.lastModified).toISOString(),
          magicBytesHex: hex,
        });
      }

      // ─── 4. BASE64 ENCODE ────────────────────────────────────────────────
      else if (tool.id === "base64-encode") {
        const reader = new FileReader();
        reader.onload = () => setBase64Text(reader.result as string);
        reader.readAsDataURL(f);
      }

      // ─── 5. JSON / YAML TEXT PRELOAD ─────────────────────────────────────
      else if (tool.id === "json-formatter") {
        const txt = await f.text();
        setJsonText(txt);
      } else if (tool.id === "yaml-formatter") {
        const txt = await f.text();
        setYamlText(txt);
      } else if (tool.id === "csv-preview") {
        const txt = await f.text();
        const rows = txt
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.split(","));
        setCsvRows(rows);
      }
    } else {
      setJob(null);
      setHashResult(null);
      setFileDetails(null);
    }
  };

  const processUtility = async () => {
    setJob((prev) => {
      const base =
        prev || createJob(files[0]?.name || "untitled", files[0]?.size || 0);
      return {
        ...base,
        status: "processing",
        progress: 30,
        message: "Processing…",
      };
    });

    try {
      let outputBlob: Blob;
      let outputFilename = `output_${Date.now()}`;

      // ─── 1. ZIP CREATE ────────────────────────────────────────────────────
      if (tool.id === "zip-create") {
        const zip = new JSZip();
        for (const f of files) {
          zip.file(f.name, f);
        }
        outputBlob = await zip.generateAsync({ type: "blob" });
        outputFilename = `archive_${Date.now()}.zip`;
      }

      // ─── 2. JSON FORMATTER ────────────────────────────────────────────────
      else if (tool.id === "json-formatter") {
        const parsed = JSON.parse(jsonText);
        const formatted = JSON.stringify(parsed, null, 2);
        outputBlob = new Blob([formatted], { type: "application/json" });
        outputFilename = "formatted.json";
        setJsonText(formatted);
      }

      // ─── 3. YAML FORMATTER ────────────────────────────────────────────────
      else if (tool.id === "yaml-formatter") {
        const parsed = yaml.load(yamlText);
        const dumped = yaml.dump(parsed);
        outputBlob = new Blob([dumped], { type: "text/yaml" });
        outputFilename = "formatted.yaml";
        setYamlText(dumped);
      }

      // ─── 4. BASE64 DECODE OR TEXT ─────────────────────────────────────────
      else if (tool.id === "base64-encode") {
        outputBlob = new Blob([base64Text], { type: "text/plain" });
        outputFilename = "base64_data.txt";
      } else if (tool.id === "zip-extract") {
        if (!zipFile) throw new Error("Upload a ZIP file first.");
        const out = new JSZip();
        const names = Object.keys(zipFile.files);
        for (const name of names) {
          const entry = zipFile.files[name];
          if (entry.dir) continue;
          out.file(name, await entry.async("uint8array"));
        }
        outputBlob = await out.generateAsync({ type: "blob" });
        outputFilename = `extracted_${Date.now()}.zip`;
      } else if (tool.id === "csv-preview") {
        const json = csvRows.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          csvRows[0]?.forEach((h, i) => {
            obj[h || `col${i}`] = row[i] || "";
          });
          return obj;
        });
        outputBlob = new Blob([JSON.stringify(json, null, 2)], {
          type: "application/json",
        });
        outputFilename = "csv.json";
      } else if (tool.id === "file-hash" && hashResult) {
        outputBlob = new Blob(
          [`SHA-256: ${hashResult.sha256}\nSHA-1: ${hashResult.sha1}\n`],
          { type: "text/plain" },
        );
        outputFilename = "hashes.txt";
      } else if (tool.id === "file-metadata" && fileDetails) {
        outputBlob = new Blob([JSON.stringify(fileDetails, null, 2)], {
          type: "application/json",
        });
        outputFilename = "metadata.json";
      } else {
        throw new Error("Nothing to process yet. Upload a file or enter text.");
      }

      const outputUrl = URL.createObjectURL(outputBlob);

      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "ready",
              progress: 100,
              message: "Done!",
              outputUrl,
              outputFilename,
              outputSize: outputBlob.size,
              completedAt: Date.now(),
            }
          : null,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Operation failed";
      setJob((prev) =>
        prev
          ? { ...prev, status: "failed", error: message, message: "Failed" }
          : null,
      );
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (job?.outputUrl && job?.outputFilename) {
      const a = document.createElement("a");
      a.href = job.outputUrl;
      a.download = job.outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={isMulti}
        maxSizeMB={tool.maxFileSizeMB || 200}
        onFilesSelected={handleFiles}
        disabled={job?.status === "processing"}
      />

      {/* ZIP Extract Viewer */}
      {tool.id === "zip-extract" && zipEntries.length > 0 && (
        <div className="p-6 rounded-xl border bg-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Archive className="w-4 h-4 text-primary" /> Archive Contents (
            {zipEntries.length} files)
          </h3>
          <div className="max-h-60 overflow-y-auto divide-y rounded-lg border">
            {zipEntries.map((e, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 text-xs gap-2"
              >
                <span className="font-mono truncate">{e.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">
                    {formatBytes(e.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={async () => {
                      if (!zipFile) return;
                      const blob = await zipFile.files[e.name].async("blob");
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = e.name.split("/").pop() || e.name;
                      a.click();
                    }}
                  >
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hash Result */}
      {tool.id === "file-hash" && hashResult && (
        <div className="p-6 rounded-xl border bg-card space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" /> File Hash Checksums
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-medium">SHA-256</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => copyToClipboard(hashResult.sha256)}
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}{" "}
                  Copy
                </Button>
              </div>
              <p className="p-2.5 bg-muted rounded font-mono text-xs break-all">
                {hashResult.sha256}
              </p>
            </div>
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-medium">SHA-1</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => copyToClipboard(hashResult.sha1)}
                >
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <p className="p-2.5 bg-muted rounded font-mono text-xs break-all">
                {hashResult.sha1}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Details */}
      {tool.id === "file-metadata" && fileDetails && (
        <div className="p-6 rounded-xl border bg-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-primary" /> File Inspection
            Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-muted rounded">
              <span className="text-muted-foreground block">Filename</span>
              <span className="font-medium break-all">
                {String(fileDetails.name)}
              </span>
            </div>
            <div className="p-3 bg-muted rounded">
              <span className="text-muted-foreground block">MIME Type</span>
              <span className="font-medium">
                {String(fileDetails.mimeType)}
              </span>
            </div>
            <div className="p-3 bg-muted rounded">
              <span className="text-muted-foreground block">Size</span>
              <span className="font-medium">
                {String(fileDetails.sizeFormatted)} (
                {String(fileDetails.sizeBytes)} bytes)
              </span>
            </div>
            <div className="p-3 bg-muted rounded">
              <span className="text-muted-foreground block">Last Modified</span>
              <span className="font-medium">
                {String(fileDetails.lastModified)}
              </span>
            </div>
          </div>
          <div className="p-3 bg-muted rounded text-xs">
            <span className="text-muted-foreground block mb-1">
              Header Magic Bytes (Hex)
            </span>
            <code className="font-mono">
              {String(fileDetails.magicBytesHex)}
            </code>
          </div>
        </div>
      )}

      {/* JSON Formatter Workspace */}
      {tool.id === "json-formatter" && (
        <div className="p-6 rounded-xl border bg-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Braces className="w-4 h-4 text-primary" /> JSON Editor & Formatter
          </h3>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={10}
            className="w-full p-3 font-mono text-xs bg-background rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Paste JSON here..."
          />
          <div className="flex gap-2">
            <Button onClick={processUtility}>Beautify & Validate JSON</Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  const m = JSON.stringify(JSON.parse(jsonText));
                  setJsonText(m);
                } catch {
                  alert("Invalid JSON");
                }
              }}
            >
              Minify
            </Button>
          </div>
        </div>
      )}

      {/* YAML Workspace */}
      {tool.id === "yaml-formatter" && (
        <div className="p-6 rounded-xl border bg-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileCode className="w-4 h-4 text-primary" /> YAML Editor &
            Formatter
          </h3>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            rows={10}
            className="w-full p-3 font-mono text-xs bg-background rounded-lg border"
            placeholder="Paste YAML here..."
          />
          <div className="flex gap-2">
            <Button onClick={processUtility}>Format & Validate YAML</Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  const obj = yaml.load(yamlText);
                  setJsonText(JSON.stringify(obj, null, 2));
                  alert("Converted to JSON successfully!");
                } catch (e: unknown) {
                  // FIX 5: Handled `unknown` catch block properly
                  const message = e instanceof Error ? e.message : String(e);
                  alert(`YAML error: ${message}`);
                }
              }}
            >
              Convert to JSON
            </Button>
          </div>
        </div>
      )}

      {/* Base64 Workspace */}
      {tool.id === "base64-encode" && (
        <div className="p-6 rounded-xl border bg-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> Base64 Data String
          </h3>
          <textarea
            value={base64Text}
            onChange={(e) => setBase64Text(e.target.value)}
            rows={8}
            className="w-full p-3 font-mono text-xs bg-background rounded-lg border break-all"
            placeholder="Base64 encoded string appears here..."
          />
          <div className="flex gap-2">
            <Button onClick={() => copyToClipboard(base64Text)}>
              {copied ? (
                <Check className="w-4 h-4 mr-1 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              Copy Base64
            </Button>
            <Button variant="outline" onClick={processUtility}>
              Save as TXT File
            </Button>
          </div>
        </div>
      )}

      {tool.id === "csv-preview" && csvRows.length > 0 && (
        <div className="p-6 rounded-2xl border bg-card overflow-auto max-h-80">
          <table className="w-full text-xs">
            <tbody>
              {csvRows.slice(0, 30).map((row, i) => (
                <tr key={i} className="border-b">
                  {row.map((cell, j) => (
                    <td key={j} className="p-2 font-mono">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mt-3" onClick={processUtility}>
            Export JSON
          </Button>
        </div>
      )}

      {tool.id === "zip-extract" && zipEntries.length > 0 && (
        <Button onClick={processUtility}>Download all as ZIP</Button>
      )}

      {/* ZIP Create Action */}
      {tool.id === "zip-create" && files.length > 0 && (
        <Button
          onClick={processUtility}
          disabled={job?.status === "processing"}
        >
          {job?.status === "processing" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Archiving...
            </>
          ) : (
            `Create ZIP Archive (${files.length} files)`
          )}
        </Button>
      )}

      {job && (
        <ProcessingPanel
          job={job}
          onDownload={handleDownload}
          onReset={() => {
            setFiles([]);
            setJob(null);
            setHashResult(null);
            setFileDetails(null);
          }}
        />
      )}
    </div>
  );
}
