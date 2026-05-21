import {
  BoundedGoban as ShudanBoundedGoban,
  Goban as ShudanGoban,
  type BoundedGobanProps as ShudanBoundedGobanProps,
  type GobanProps as ShudanGobanProps,
  type Vertex,
} from "@sabaki/shudan";
import type { ComponentType } from "react";

export type { Vertex };
export type Sign = 0 | 1 | -1;
export type SignMap = Sign[][];

export type GobanProps = ShudanGobanProps;
export type BoundedGobanProps = ShudanBoundedGobanProps;

const GobanComponent = ShudanGoban as unknown as ComponentType<ShudanGobanProps>;
const BoundedGobanComponent = ShudanBoundedGoban as unknown as ComponentType<
  ShudanBoundedGobanProps
>;

export function Goban(props: ShudanGobanProps) {
  return <GobanComponent {...props} />;
}

export function BoundedGoban(props: ShudanBoundedGobanProps) {
  return <BoundedGobanComponent {...props} />;
}
