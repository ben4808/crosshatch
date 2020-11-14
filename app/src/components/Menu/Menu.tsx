import React from 'react';
import "./Menu.scss";
import { MenuProps } from './MenuProps';
import Globals from '../../lib/windowService';

function Menu(props: MenuProps) {
    function handleViewChange() {
        if (Globals.changeView) {
            Globals.changeView();
        }
    }

    function handleNewGrid() {
        if (Globals.makeNewGrid) {
            Globals.makeNewGrid();
        }
    }

    function handleLoadPuz() {
        if (Globals.loadPuz) {
            Globals.loadPuz();
        }
    }

    function handleExportPuz() {
        if (Globals.exportPuz) {
            Globals.exportPuz();
        }
    }

    return (
        <div id="Menu">
            <div className="menu-label">View</div>
            <div className="btn-group" role="group" id="view-change-group">
                <button type="button" 
                    className={"btn" + props.openView === "Clues" ? " btn-primary" : " btn-secondary"}
                    onClick={handleViewChange}>
                    Clues
                </button>
                <button type="button" 
                    className={"btn" + props.openView === "Fill" ? " btn-primary" : " btn-secondary"}
                    onClick={handleViewChange}>
                    Fill
                </button>
            </div>
            
            <div className="btn btn-primary" onClick={handleNewGrid}>New Grid</div>
            <input type="text" className="form-control" value={props.gridWidth}></input>
            <div className="menu-gridsize-sep">x</div>
            <input type="text" className="form-control" value={props.gridHeight}></input>

            <div id="loadPuz" className="btn btn-primary" onClick={handleLoadPuz}>Load .puz</div>
            <div id="exportPuz" className="btn btn-primary" onClick={handleExportPuz}>Export .puz</div>
        </div>
    );
}

export default Menu;