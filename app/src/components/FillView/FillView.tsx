import React from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';

function FillView() {
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

    function entryCandidateClick(event: any) {
        alert("hi");
    }

    let grid = Globals.puzzle?.grid;
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    let fillStatus = getFillStatusString(Globals.fillStatus!);

    let entryCandidatesStyle = {
        gridTemplateColumns: `4fr 1fr 1fr 1fr`
    } as React.CSSProperties;

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

            <div className="fill-lists">
                <div className="fill-list-box">
                    <div className="fill-list-title">Word List Updates</div>
                    <div className="fill-list-button">Export</div>
                    <input type="text" className="fill-add-word-box" placeholder="Add word..."></input>
                    <div className="fill-list" style={{marginTop: "5px", height: "300px"}}>

                    </div>
                </div>
                <div className="fill-list-box">
                    <div className="fill-list-title">Entry Candidates</div>
                    <div className="fill-list" style={entryCandidatesStyle}>
                        <div className="fill-list-header">Entry</div>
                        <div className="fill-list-header">min</div>
                        <div className="fill-list-header">sum</div>
                        <div className="fill-list-header">Score</div>
                        <div className="fill-list-row-wrapper">
                            <div>CROSSWORDPUZZLEENTRIES</div>
                            <div>0</div>
                            <div>1470</div>
                            <div>52.75</div>
                        </div>
                        <div className="fill-list-row-wrapper" onClick={entryCandidateClick}>
                            <div>TESTENTRY</div>
                            <div>3</div>
                            <div>977</div>
                            <div>14.2</div>
                        </div>
                    </div>
                </div>
                <div className="fill-list-box">
                    <div className="fill-list-title">Saved Grids</div>
                    <div className="fill-list-button">Remove</div>
                    <div className="fill-list">

                    </div>
                </div>
                <div className="fill-list-box">
                    <div className="fill-list-title">Grid Candidates</div>
                    <div className="fill-list-button">Save</div>
                    <div className="fill-list">

                    </div>
                </div>
            </div>
        </div>
    );
}

export default FillView;
