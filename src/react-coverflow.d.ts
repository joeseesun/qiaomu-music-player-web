declare module "react-coverflow" {
  import type { ComponentClass, ReactNode } from "react";

  type CoverflowMedia = Record<string, Record<string, string | number>>;

  interface CoverflowProps {
    children?: ReactNode;
    width?: string | number;
    height?: string | number;
    displayQuantityOfSide?: number;
    navigation?: boolean;
    enableHeading?: boolean;
    enableScroll?: boolean;
    infiniteScroll?: boolean;
    active?: number;
    clickable?: boolean;
    currentFigureScale?: number;
    otherFigureScale?: number;
    media?: CoverflowMedia;
  }

  const Coverflow: ComponentClass<CoverflowProps>;
  export default Coverflow;
}
