import React from 'react';
import "./Menu.scss";
import { MenuProps } from './MenuProps';
import Globals from '../../lib/windowService';
//import { FillStatus } from '../../models/FillStatus';

function Menu(props: MenuProps) {
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

    //let isFilling = Globals.gridState ? Globals.gridState.fillStatus === FillStatus.Running : false;

    return (
        <div id="Menu" className="menu-container">
            <button className="btn btn-primary" onClick={handleFillWordClick}>Fill Word</button>
            <br />
            <button className="btn btn-primary" onClick={handleFillGridClick}>Fill Grid</button>
            <button className="btn btn-secondary" onClick={handlePauseFill}>Pause</button>
        </div>
    );
}

export default Menu;