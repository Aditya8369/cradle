import React, { useState } from "react";
import PropTypes from "prop-types";

const TOTAL_MEMORY = 100; // Total memory blocks

export default function MemoryAllocatorVisualizer() {
  const [memory, setMemory] = useState(
    Array(TOTAL_MEMORY).fill({ allocated: false, processId: null, size: 0 })
  );
  const [processSize, setProcessSize] = useState("");
  const [processName, setProcessName] = useState("");
  const [strategy, setStrategy] = useState("first-fit");
  const [log, setLog] = useState([]);

  const addLog = message => {
    setLog(prev => [message, ...prev.slice(0, 9)]);
  };

  // Allocate memory block
  const handleAllocate = e => {
    e.preventDefault();
    const size = parseInt(processSize, 10);
    if (!size || size <= 0 || !processName) return;

    let startIndex = -1;
    let currentBlockSize = 0;

    if (strategy === "first-fit") {
      for (let i = 0; i < TOTAL_MEMORY; i++) {
        if (!memory[i].allocated) {
          if (currentBlockSize === 0) startIndex = i;
          currentBlockSize++;
          if (currentBlockSize === size) break;
        } else {
          currentBlockSize = 0;
          startIndex = -1;
        }
      }
    } else if (strategy === "best-fit") {
      let bestStartIndex = -1;
      let minBlockSize = Infinity;
      let currentStart = -1;
      let currentSize = 0;

      for (let i = 0; i <= TOTAL_MEMORY; i++) {
        if (i < TOTAL_MEMORY && !memory[i].allocated) {
          if (currentSize === 0) currentStart = i;
          currentSize++;
        } else {
          if (currentSize >= size && currentSize < minBlockSize) {
            minBlockSize = currentSize;
            bestStartIndex = currentStart;
          }
          currentSize = 0;
        }
      }
      startIndex = bestStartIndex;
    }

    if (startIndex === -1 || startIndex + size > TOTAL_MEMORY) {
      addLog(
        `❌ Allocation failed for "${processName}" (${size} blocks): Not enough contiguous memory.`
      );
      return;
    }

    const newMemory = [...memory];
    for (let i = startIndex; i < startIndex + size; i++) {
      newMemory[i] = { allocated: true, processId: processName, size };
    }

    setMemory(newMemory);
    addLog(
      `✅ Allocated ${size} blocks for "${processName}" starting at index ${startIndex}.`
    );
    setProcessSize("");
    setProcessName("");
  };

  // Deallocate memory block by process name
  const handleDeallocate = name => {
    const newMemory = memory.map(block =>
      block.processId === name
        ? { allocated: false, processId: null, size: 0 }
        : block
    );
    setMemory(newMemory);
    addLog(`🗑️ Deallocated process "${name}".`);
  };

  // Reset memory
  const handleReset = () => {
    setMemory(
      Array(TOTAL_MEMORY).fill({ allocated: false, processId: null, size: 0 })
    );
    setLog([]);
    addLog("🔄 Memory reset.");
  };

  // Calculate fragmentation metric (count of unallocated contiguous gaps)
  const getFragmentationCount = () => {
    let gaps = 0;
    let inGap = false;
    for (let i = 0; i < TOTAL_MEMORY; i++) {
      if (!memory[i].allocated) {
        if (!inGap) {
          gaps++;
          inGap = true;
        }
      } else {
        inGap = false;
      }
    }
    return gaps;
  };

  const activeProcesses = Array.from(
    new Set(memory.filter(b => b.allocated).map(b => b.processId))
  );

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "900px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h2>Memory Allocator Visualizer</h2>
      <p style={{ color: "#666" }}>
        Simulate memory allocation, deallocation, and fragmentation.
      </p>

      {/* Controls Form */}
      <form
        onSubmit={handleAllocate}
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Process Name (e.g. P1)"
          value={processName}
          onChange={e => setProcessName(e.target.value)}
          required
          style={{ padding: "0.5rem", flex: "1" }}
        />
        <input
          type="number"
          placeholder="Size (blocks)"
          value={processSize}
          onChange={e => setProcessSize(e.target.value)}
          min="1"
          max={TOTAL_MEMORY}
          required
          style={{ padding: "0.5rem", width: "130px" }}
        />
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value)}
          style={{ padding: "0.5rem" }}
        >
          <option value="first-fit">First-Fit</option>
          <option value="best-fit">Best-Fit</option>
        </select>
        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Allocate
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            padding: "0.5rem 1rem",
            background: "#dc2626",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </form>

      {/* Metrics Bar */}
      <div
        style={{
          display: "flex",
          gap: "2rem",
          marginBottom: "1rem",
          fontSize: "0.9rem",
          background: "#f1f5f9",
          padding: "0.75rem",
          borderRadius: "6px",
        }}
      >
        <div>
          <strong>Total Blocks:</strong> {TOTAL_MEMORY}
        </div>
        <div>
          <strong>Allocated:</strong> {memory.filter(b => b.allocated).length}
        </div>
        <div>
          <strong>Free:</strong> {memory.filter(b => !b.allocated).length}
        </div>
        <div>
          <strong>External Fragmentation (Gaps):</strong>{" "}
          {getFragmentationCount()}
        </div>
      </div>

      {/* Memory Grid Visualization */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: "4px",
          marginBottom: "1.5rem",
          background: "#e2e8f0",
          padding: "10px",
          borderRadius: "8px",
        }}
      >
        {memory.map((block, idx) => (
          <div
            key={idx}
            title={`Block ${idx}: ${block.allocated ? block.processId : "Free"}`}
            style={{
              height: "35px",
              background: block.allocated ? "#3b82f6" : "#ffffff",
              color: block.allocated ? "#ffffff" : "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
              borderRadius: "4px",
              border: "1px solid #cbd5e1",
              overflow: "hidden",
            }}
          >
            {block.allocated ? block.processId : idx}
          </div>
        ))}
      </div>

      {/* Active Processes Deallocation Panel */}
      {activeProcesses.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h4>Active Processes</h4>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {activeProcesses.map(name => (
              <button
                key={name}
                onClick={() => handleDeallocate(name)}
                style={{
                  padding: "0.4rem 0.8rem",
                  background: "#475569",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Free {name} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Event Log */}
      <div
        style={{
          background: "#0f172a",
          color: "#38bdf8",
          padding: "1rem",
          borderRadius: "8px",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          maxHeight: "150px",
          overflowY: "auto",
        }}
      >
        <strong>Simulation Log:</strong>
        {log.map((entry, index) => (
          <div key={index} style={{ marginTop: "0.25rem" }}>
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}

MemoryAllocatorVisualizer.propTypes = {};
