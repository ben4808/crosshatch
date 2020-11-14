import React from 'react';
import { FillViewProps } from './FillViewProps';
import Globals from '../../lib/windowService';

function FillView(props: FillViewProps) {
    function handleFillWordClick() {
        if (Globals.fillWordHandler) {
            Globals.fillWordHandler();
        }
    }

    function handleFillGridClick() {
        if (Globals.fillGridHandler) {
            Globals.fillGridHandler();
        }
    }

    function handlePauseFill() {
        if (Globals.pauseFill) {
            Globals.pauseFill();
        }
    }

    return (
        <div id="FillView" className="fill-container">
            <button className="btn btn-primary" onClick={handleFillWordClick}>Fill Word</button>
            <br />
            <button className="btn btn-primary" onClick={handleFillGridClick}>Fill Grid</button>
            <button className="btn btn-secondary" onClick={handlePauseFill}>Pause</button>
        </div>
    );
}

export default FillView;