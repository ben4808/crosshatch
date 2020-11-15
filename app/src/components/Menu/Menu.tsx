import React, { useContext } from 'react';
import "./Menu.scss";
import { MenuProps } from './MenuProps';
import { AppContext } from '../../AppContext';
import { Puzzle } from '../../models/Puzzle';
import { processPuzData } from '../../lib/puzFiles';

function Menu(props: MenuProps) {
    const appContext = useContext(AppContext);

    function handleViewChange(event: any) {
        let target = event.target;
        let newView = target.attributes["data-view-id"].value;
        
        appContext.switchActiveView(newView);
    }

    function handleNewGrid() {
    }

    function handleLoadPuz() {
        document.getElementById("open-puzzle-input")!.click();
    }

    function handleExportPuz() {
    }

    function handleFocus(event: any) {
        event.target.select();
    }

    function onFileUpload(event: any) {
        let file = event.target.files[0];
        event.target.value = null;

        let puzzle: Puzzle;
        processPuzData(file).then(puz => {
            if (puz) {
                puzzle = puz;
            }
        });
    }

    return (
        <div id="Menu">
            <input id="open-puzzle-input" hidden type="file" accept=".puz" onChange={onFileUpload} />

            <div className="site-title">CrossHatch</div>

            <div className="menu-label">View: </div>
            <div className="btn-group" role="group" id="view-change-group">
                <button type="button" data-view-id="Clues"
                    className={"btn" + (props.openView === "Clues" ? " btn-primary" : " btn-secondary")}
                    onClick={handleViewChange}>
                    Clues
                </button>
                <button type="button" data-view-id="Fill"
                    className={"btn" + (props.openView === "Fill" ? " btn-primary" : " btn-secondary")}
                    onClick={handleViewChange}>
                    Fill
                </button>
            </div>
            
            <div className="new-grid-group">
                <div className="btn btn-primary" onClick={handleNewGrid}>New Grid</div>
                <input type="text" className="form-control" defaultValue={props.gridWidth} onFocus={handleFocus}></input>
                <div className="menu-gridsize-sep"><div style={{height:"6px", float:"none"}}></div>x</div>
                <input type="text" className="form-control" defaultValue={props.gridHeight} onFocus={handleFocus}></input>
            </div>
            
            <div id="loadPuz" className="btn btn-primary menu-button" onClick={handleLoadPuz}>Load .puz</div>
            <div id="exportPuz" className="btn btn-primary menu-button" onClick={handleExportPuz}>Export .puz</div>
        </div>
    );
}

export default Menu;