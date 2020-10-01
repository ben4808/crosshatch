export interface AppContext {
    fillHandler: () => void;
    setFillHandler: (handler: () => void) => void;
}