import React, { useContext } from 'react';
import { FillViewProps } from './FillViewProps';
import { AppContext } from '../../AppContext';

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