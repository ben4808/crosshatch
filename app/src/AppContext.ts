import React from "react";
import { FillStatus } from "./models/FillStatus";

export const AppContext = React.createContext({
    triggerUpdate: () => {},
    switchActiveView: (_: string) => {},

    fillWord: () => {},
    fillGrid: () => {},
    pauseFill: () => {},
    fillStatus: FillStatus.Ready,
    setFillStatus: (_: FillStatus) => {}
  });