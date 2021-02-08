import React, { createRef, useContext, useRef } from 'react';
import "./Menu.scss";
import { MenuProps } from './MenuProps';
import { AppContext } from '../../AppContext';
import { processPuzData } from '../../lib/puzFiles';

function Menu(props: MenuProps) {
    const appContext = useContext(AppContext);
    const sizeRefs = useRef([createRef(), createRef()] as any[]);

    function handleViewChange(event: any) {
        let target = event.target;
        let newView = target.attributes["data-view-id"].value;
        
        appContext.switchActiveView(newView);
    }

    function handleNewPuzzle() {
        if (!window.confirm("Are you sure you want to start a new puzzle?")) return;

        let newWidth = +sizeRefs.current[0].current.value;
        let newHeight = +sizeRefs.current[1].current.value;

        appContext.createNewPuzzle(newWidth, newHeight);
    }

    function handleLoadPuz() {
        document.getElementById("open-puzzle-input")!.click();
    }

    function handleExportPuz() {
        appContext.exportPuz();
    }

    function handleFocus(event: any) {
        event.target.select();
    }

    function onFileUpload(event: any) {
        let file = event.target.files[0];
        event.target.value = null;

        processPuzData(file).then(puzzle => {
            if (puzzle) {
                appContext.setPuzzle(puzzle);
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
                <div className="btn btn-primary" onClick={handleNewPuzzle}>New Puzzle</div>
                <input type="text" className="form-control" defaultValue={props.gridWidth} onFocus={handleFocus}
                    ref={sizeRefs.current[0]}></input>
                <div className="menu-gridsize-sep"><div style={{height:"6px", float:"none"}}></div>x</div>
                <input type="text" className="form-control" defaultValue={props.gridHeight} onFocus={handleFocus}
                    ref={sizeRefs.current[1]}></input>
            </div>
            
            <div id="loadPuz" className="btn btn-primary menu-button" onClick={handleLoadPuz}>Load .puz</div>
            <div id="exportPuz" className="btn btn-primary menu-button" onClick={handleExportPuz}>Export .puz</div>
        </div>
    );
}

export default Menu;
