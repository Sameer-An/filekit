import test from "node:test";
import assert from "node:assert/strict";

// Utility function to test marquee intersection
function rectsIntersect(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

// Alignment math functions in PDF coordinates (y-up: minY=bottom, maxY=top)
function alignObjects(objects, axis, mode) {
  const rects = objects.map((o) => o.rect);
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  return objects.map((o) => {
    const rect = { ...o.rect };
    if (axis === "x") {
      if (mode === "start") rect.x = minX;
      if (mode === "center") rect.x = (minX + maxX) / 2 - rect.w / 2;
      if (mode === "end") rect.x = maxX - rect.w;
    } else {
      if (mode === "start") rect.y = minY; // bottom
      if (mode === "center") rect.y = (minY + maxY) / 2 - rect.h / 2; // middle
      if (mode === "end") rect.y = maxY - rect.h; // top
    }
    return { ...o, rect, dirty: true };
  });
}

function distributeObjects(objects, axis) {
  if (objects.length < 3) return objects;
  const sorted = [...objects].sort((a, b) =>
    axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (axis === "x") {
    const totalSpan = last.rect.x + last.rect.w - first.rect.x;
    const totalObjW = sorted.reduce((sum, o) => sum + o.rect.w, 0);
    const gap = (totalSpan - totalObjW) / (sorted.length - 1);
    let curX = first.rect.x;
    return sorted.map((o) => {
      const res = { ...o, rect: { ...o.rect, x: curX }, dirty: true };
      curX += o.rect.w + gap;
      return res;
    });
  } else {
    const totalSpan = last.rect.y + last.rect.h - first.rect.y;
    const totalObjH = sorted.reduce((sum, o) => sum + o.rect.h, 0);
    const gap = (totalSpan - totalObjH) / (sorted.length - 1);
    let curY = first.rect.y;
    return sorted.map((o) => {
      const res = { ...o, rect: { ...o.rect, y: curY }, dirty: true };
      curY += o.rect.h + gap;
      return res;
    });
  }
}

test("Improvement 1: Selection & Group Operations", async (t) => {
  await t.test("Marquee rectsIntersect properly detects overlaps", () => {
    const boxA = { x: 50, y: 50, w: 100, h: 50 };
    // Intersecting
    assert.equal(rectsIntersect(boxA, { x: 100, y: 70, w: 100, h: 50 }), true);
    // Containing
    assert.equal(rectsIntersect(boxA, { x: 40, y: 40, w: 150, h: 100 }), true);
    // Completely to the right
    assert.equal(rectsIntersect(boxA, { x: 200, y: 50, w: 50, h: 50 }), false);
    // Completely above
    assert.equal(rectsIntersect(boxA, { x: 50, y: 150, w: 50, h: 50 }), false);
  });

  await t.test("Align objects horizontally (Left, Center, Right)", () => {
    const items = [
      { id: "1", rect: { x: 100, y: 100, w: 40, h: 20 } },
      { id: "2", rect: { x: 200, y: 100, w: 60, h: 20 } },
    ];
    // Left align: all should align to x = 100
    const leftAligned = alignObjects(items, "x", "start");
    assert.equal(leftAligned[0].rect.x, 100);
    assert.equal(leftAligned[1].rect.x, 100);

    // Right align: rightmost edge is 200 + 60 = 260
    const rightAligned = alignObjects(items, "x", "end");
    assert.equal(rightAligned[0].rect.x, 260 - 40); // 220
    assert.equal(rightAligned[1].rect.x, 200);

    // Center align: span 100 to 260, mid = 180
    const centerAligned = alignObjects(items, "x", "center");
    assert.equal(centerAligned[0].rect.x, 180 - 20); // 160
    assert.equal(centerAligned[1].rect.x, 180 - 30); // 150
  });

  await t.test("Align objects vertically (Top, Middle, Bottom)", () => {
    const items = [
      { id: "1", rect: { x: 50, y: 100, w: 50, h: 20 } },
      { id: "2", rect: { x: 50, y: 300, w: 50, h: 40 } },
    ];
    // Bottom align (minY = 100)
    const bottomAligned = alignObjects(items, "y", "start");
    assert.equal(bottomAligned[0].rect.y, 100);
    assert.equal(bottomAligned[1].rect.y, 100);

    // Top align (maxY = 300 + 40 = 340)
    const topAligned = alignObjects(items, "y", "end");
    assert.equal(topAligned[0].rect.y, 340 - 20); // 320
    assert.equal(topAligned[1].rect.y, 300);
  });

  await t.test("Distribute objects evenly (Horizontal and Vertical)", () => {
    const itemsH = [
      { id: "1", rect: { x: 0, y: 50, w: 20, h: 20 } },
      { id: "2", rect: { x: 30, y: 50, w: 20, h: 20 } },
      { id: "3", rect: { x: 100, y: 50, w: 20, h: 20 } },
    ];
    // Total span: 120 - 0 = 120. Total width: 60. Remaining gap space: 60. 2 gaps => 30 each.
    const distH = distributeObjects(itemsH, "x");
    assert.equal(distH[0].rect.x, 0);
    assert.equal(distH[1].rect.x, 50); // 0 + 20 + 30 = 50
    assert.equal(distH[2].rect.x, 100); // 50 + 20 + 30 = 100
  });
});
