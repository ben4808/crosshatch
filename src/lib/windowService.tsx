import { GlobalsObj } from "../models/GlobalsObj";

const globals = {} as GlobalsObj;
if (typeof window !== "undefined") {
    (window as any).Globals = globals;
}
export default globals;
