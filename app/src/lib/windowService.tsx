import { GlobalsObj } from "../models/GlobalsObj";

declare const window: any;
window.Globals = {} as GlobalsObj;
export default window.Globals as GlobalsObj;
