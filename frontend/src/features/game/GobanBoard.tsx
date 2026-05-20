import { emptySignMap, vertexToGtp, type MarkerMap } from "@/lib/go/coordinates";
import { Goban, type SignMap, type Vertex } from "@/lib/go/shudan";

const BOARD_SIZE = 19;

type GobanBoardProps = {
  signMap?: SignMap;
  markerMap?: MarkerMap;
  vertexSize?: number;
  showCoordinates?: boolean;
  onVertexClick?: (vertex: Vertex) => void;
  onGtpClick?: (coordinate: string) => void;
};

export default function GobanBoard({
  signMap = emptySignMap(BOARD_SIZE),
  markerMap,
  vertexSize = 30,
  showCoordinates = true,
  onVertexClick,
  onGtpClick,
}: GobanBoardProps) {
  const handleVertexClick =
    onVertexClick || onGtpClick
      ? (_event: Event, vertex: Vertex) => {
          onVertexClick?.(vertex);
          onGtpClick?.(vertexToGtp(vertex, BOARD_SIZE));
        }
      : undefined;

  return (
    <Goban
      signMap={signMap}
      markerMap={markerMap}
      vertexSize={vertexSize}
      showCoordinates={showCoordinates}
      onVertexClick={handleVertexClick}
    />
  );
}
