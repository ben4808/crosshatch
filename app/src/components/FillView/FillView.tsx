import React, { useContext, useEffect } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { AppContext } from '../../AppContext';

function FillView(props: any) {
    const appContext = useContext(AppContext);

    useEffect(() => {
        // eslint-disable-next-line
        let a = appContext.triggerUpdate;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.updateSemaphore]);

    function handleFillWordClick() {
        Globals.fillWord!();
    }

    function handleFillGridClick() {
        Globals.fillGrid!();
    }

    function handlePauseFill() {
        Globals.pauseFill!();
    }

    function handleSymmetryChange(event: any) {
        Globals.gridSymmetry = +SymmetryType[event.target[event.target.selectedIndex].value] as SymmetryType;
    }

    function getSymmetryTypeString(type: string): string {
        switch(type) {
            case "None": return "None";
            case "Rotate180": return "180° Rotational";
            case "Rotate90": return "90° Rotational";
            case "MirrorHorizontal": return "Mirror Horizontally";
            case "MirrorVertical": return "Mirror Vertically";
            case "MirrorNWSE": return "Mirror NW to SE";
            case "MirrorNESW": return "Mirror NE to SW";
        }
        return "";
    }

    function getSymmetryTypesForRectGrids(): string[] {
        return ["None", "Rotate180", "MirrorHorizontal", "MirrorVertical"];
    }

    function getFillStatusString(status: FillStatus): string {
        switch(status) {
            case FillStatus.Ready: return "Ready to Fill";
            case FillStatus.Running: return "Fill Running...";
            case FillStatus.Success: return "Fill Succeeded";
            case FillStatus.Failed: return "Fill Failed";
            case FillStatus.Paused: return "Fill Paused";
            default: return "";
        }
    }

    let grid = Globals.puzzle?.grid;
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatus = getFillStatusString(Globals.fillStatus!);

    return (
        <div id="FillView" className="fill-container">
            <div className="fill-status">{fillStatus}</div>
            <br />
            <button className="btn btn-primary" onClick={handleFillWordClick}>Fill Word</button>
            <br /><br />
            <button className="btn btn-primary" onClick={handleFillGridClick}>Fill Grid</button>
            <button className="btn btn-secondary" onClick={handlePauseFill}>Pause</button>
            <br /><br />
            Grid Symmetry: <br />
            <select className="custom-select symmetry-select" defaultValue={selectedSymmetry} onChange={handleSymmetryChange}>
                {symmetryOptions.map(type => (
                    <option value={type} key={type}>{getSymmetryTypeString(type.toString())}</option>
                ))}
            </select>
        </div>
    );
}

export default FillView;
