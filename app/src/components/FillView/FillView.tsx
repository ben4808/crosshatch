import React, { useContext } from 'react';
import { FillViewProps } from './FillViewProps';
import { AppContext } from '../../AppContext';
import { FillStatus } from '../../models/FillStatus';

function FillView(props: FillViewProps) {
    const appContext = useContext(AppContext);

    function handleFillWordClick() {
        appContext.fillWord();
    }

    function handleFillGridClick() {
        appContext.fillGrid();
    }

    function handlePauseFill() {
        appContext.pauseFill();
    }

    return (
        <div id="FillView" className="fill-container">
            <button className="btn btn-primary" onClick={handleFillWordClick}>Fill Word</button>
            <br /><br />
            <button className="btn btn-primary" onClick={handleFillGridClick}>Fill Grid</button>
            <button className="btn btn-secondary" onClick={handlePauseFill}>Pause</button>
        </div>
    );
}

export default FillView;

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