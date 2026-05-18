import {
  Goban as ShudanGoban,
  type GobanProps as ShudanGobanProps,
  type Vertex,
} from "@sabaki/shudan";
import type { ComponentType } from "react";

export type { Vertex };
export type Sign = 0 | 1 | -1;
export type SignMap = Sign[][];

export type GobanProps = ShudanGobanProps;

const GobanComponent = ShudanGoban as unknown as ComponentType<ShudanGobanProps>;

export function Goban(props: ShudanGobanProps) {
  return <GobanComponent {...props} />;
}
