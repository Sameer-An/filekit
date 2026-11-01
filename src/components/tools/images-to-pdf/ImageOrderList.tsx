// src/components/tools/images-to-pdf/ImageOrderList.tsx
"use client";

import React, { memo, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  RotateCcw,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  ArrowUpDown,
  ArrowLeftRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { ImageItem } from "./types";
import {
  moveItemUp,
  moveItemDown,
  moveItemToTop,
  moveItemToBottom,
  sortItemsByName,
  reverseItemList,
  moveItemIndex,
} from "@/lib/images-to-pdf-layout";

interface SortableItemProps {
  item: ImageItem;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRotate: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onMoveToTop: (index: number) => void;
  onMoveToBottom: (index: number) => void;
}

const SortableRow = memo(function SortableRow({
  item,
  index,
  total,
  isSelected,
  onSelect,
  onRotate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onMoveToBottom,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      onMoveUp(index);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      onMoveDown(index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(item.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`${item.name}, item ${index + 1} of ${total}`}
      className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none focus:outline-hidden focus:ring-2 focus:ring-primary/60 ${
        isSelected
          ? "bg-primary/5 border-primary shadow-xs"
          : "bg-card hover:bg-muted/40 border-border"
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing p-1 -ml-1 rounded-sm focus:ring-1 focus:ring-primary"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Index badge */}
      <span className="w-6 text-center font-mono text-xs font-bold text-muted-foreground">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded-lg bg-muted/60 overflow-hidden shrink-0 border flex items-center justify-center">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt=""
            className="w-full h-full object-contain transition-transform"
            style={{ transform: `rotate(${item.rotation}deg)` }}
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">Loading</span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-xs font-medium truncate">{item.name}</p>
        <p className="text-[11px] text-muted-foreground font-mono">
          {item.width} × {item.height} • {formatBytes(item.size)}
          {item.rotation !== 0 && ` • ${item.rotation}°`}
        </p>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onRotate(item.id, -90)}
          title="Rotate left 90°"
          aria-label="Rotate left 90 degrees"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onRotate(item.id, 90)}
          title="Rotate right 90°"
          aria-label="Rotate right 90 degrees"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </Button>

        {/* Ordering up/down buttons */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === 0}
          onClick={() => onMoveUp(index)}
          title="Move up (Alt+Up)"
          aria-label="Move up"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === total - 1}
          onClick={() => onMoveDown(index)}
          title="Move down (Alt+Down)"
          aria-label="Move down"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 hidden sm:inline-flex"
          disabled={index === 0}
          onClick={() => onMoveToTop(index)}
          title="Move to top"
          aria-label="Move to top"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 hidden sm:inline-flex"
          disabled={index === total - 1}
          onClick={() => onMoveToBottom(index)}
          title="Move to bottom"
          aria-label="Move to bottom"
        >
          <ChevronsDown className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          onClick={() => onRemove(item.id)}
          title="Remove"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
});

interface ImageOrderListProps {
  items: ImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onItemsChange: (items: ImageItem[]) => void;
  onAddMore: () => void;
}

export function ImageOrderList({
  items,
  selectedId,
  onSelect,
  onItemsChange,
  onAddMore,
}: ImageOrderListProps) {
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = moveItemIndex(items, oldIndex, newIndex);
        onItemsChange(next);
        setLiveAnnouncement(
          `Image ${oldIndex + 1} moved to position ${newIndex + 1}`,
        );
      }
    },
    [items, onItemsChange],
  );

  const handleRotate = useCallback(
    (id: string, delta: number) => {
      onItemsChange(
        items.map((i) =>
          i.id === id ? { ...i, rotation: (i.rotation + delta + 360) % 360 } : i,
        ),
      );
    },
    [items, onItemsChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onItemsChange(items.filter((i) => i.id !== id));
      setLiveAnnouncement("Image removed");
    },
    [items, onItemsChange],
  );

  const handleMoveUp = useCallback(
    (idx: number) => {
      if (idx <= 0) return;
      onItemsChange(moveItemUp(items, idx));
      setLiveAnnouncement(`Image ${idx + 1} moved to position ${idx}`);
    },
    [items, onItemsChange],
  );

  const handleMoveDown = useCallback(
    (idx: number) => {
      if (idx >= items.length - 1) return;
      onItemsChange(moveItemDown(items, idx));
      setLiveAnnouncement(`Image ${idx + 1} moved to position ${idx + 2}`);
    },
    [items, onItemsChange],
  );

  const handleMoveToTop = useCallback(
    (idx: number) => {
      if (idx <= 0) return;
      onItemsChange(moveItemToTop(items, idx));
      setLiveAnnouncement(`Image ${idx + 1} moved to top`);
    },
    [items, onItemsChange],
  );

  const handleMoveToBottom = useCallback(
    (idx: number) => {
      if (idx >= items.length - 1) return;
      onItemsChange(moveItemToBottom(items, idx));
      setLiveAnnouncement(`Image ${idx + 1} moved to bottom`);
    },
    [items, onItemsChange],
  );

  return (
    <div className="space-y-3">
      {/* Accessible live region */}
      <span className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </span>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-card border text-xs">
        <span className="font-semibold px-1">
          {items.length} {items.length === 1 ? "Image" : "Images"}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onAddMore}
          >
            <Plus className="w-3.5 h-3.5" /> Add More
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onItemsChange(sortItemsByName(items, "asc"))}
            title="Sort A to Z"
          >
            <ArrowUpDown className="w-3.5 h-3.5" /> A-Z
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onItemsChange(sortItemsByName(items, "desc"))}
            title="Sort Z to A"
          >
            <ArrowUpDown className="w-3.5 h-3.5" /> Z-A
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onItemsChange(reverseItemList(items))}
            title="Reverse list order"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Reverse
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => onItemsChange([])}
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Reorderable List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <SortableRow
                key={item.id}
                item={item}
                index={idx}
                total={items.length}
                isSelected={item.id === selectedId}
                onSelect={onSelect}
                onRotate={handleRotate}
                onRemove={handleRemove}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onMoveToTop={handleMoveToTop}
                onMoveToBottom={handleMoveToBottom}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
