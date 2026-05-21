import { useEffect, useRef, useState } from "react";

import { emptySignMap, vertexToGtp, type MarkerMap } from "@/lib/go/coordinates";
import { BoundedGoban, type SignMap, type Vertex } from "@/lib/go/shudan";
import {
  computeBoardBounds,
  DEFAULT_MAX_VERTEX_SIZE,
} from "@/lib/layout/boardSizing";

const BOARD_SIZE = 19;

type GobanBoardProps = {
  signMap?: SignMap;
  markerMap?: MarkerMap;
  maxVertexSize?: number;
  showCoordinates?: boolean;
  onVertexClick?: (vertex: Vertex) => void;
  onGtpClick?: (coordinate: string) => void;
};

export default function GobanBoard({
  signMap = emptySignMap(BOARD_SIZE),
  markerMap,
  maxVertexSize = DEFAULT_MAX_VERTEX_SIZE,
  showCoordinates = true,
  onVertexClick,
  onGtpClick,
}: GobanBoardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(() =>
    computeBoardBounds(
      typeof window !== "undefined" ? window.innerWidth : 320,
      typeof window !== "undefined" ? window.innerHeight : undefined,
      { boardSize: BOARD_SIZE, showCoordinates },
    ),
  );

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const updateBounds = () => {
      const width =
        element.clientWidth > 0 ? element.clientWidth : window.innerWidth;
      setBounds(
        computeBoardBounds(width, window.innerHeight, {
          boardSize: BOARD_SIZE,
          showCoordinates,
        }),
      );
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(element);
    window.addEventListener("resize", updateBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [showCoordinates]);

  const handleVertexClick =
    onVertexClick || onGtpClick
      ? (_event: Event, vertex: Vertex) => {
          onVertexClick?.(vertex);
          onGtpClick?.(vertexToGtp(vertex, BOARD_SIZE));
        }
      : undefined;

  return (
    <div ref={rootRef} className="goban-board-root">
      <BoundedGoban
        signMap={signMap}
        markerMap={markerMap}
        showCoordinates={showCoordinates}
        maxWidth={bounds.maxWidth}
        maxHeight={bounds.maxHeight}
        maxVertexSize={maxVertexSize}
        onVertexClick={handleVertexClick}
      />
    </div>
  );
}
