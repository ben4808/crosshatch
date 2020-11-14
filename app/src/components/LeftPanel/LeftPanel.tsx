import React from 'react';
import CluesView from '../CluesView/CluesView';
import FillView from '../FillView/FillView';
import Menu from '../Menu/Menu';
import "./LeftPanel.scss";
import { LeftPanelProps } from './LeftPanelProps';

function LeftPanel(props: LeftPanelProps) {
    return (
        <div id="LeftPanel">
            <Menu gridHeight={props.gridHeight} gridWidth={props.gridWidth} openView={props.openView}></Menu>
            {props.openView === "Clues" && 
                <CluesView></CluesView>
            }
            {props.openView === "Fill" && 
                <FillView></FillView>
            }
        </div>
    );
}

export default LeftPanel;