import React from 'react';
import Menu from '../Menu/Menu';
import "./LeftPanel.scss";
import { LeftPanelProps } from './LeftPanelProps';

function LeftPanel(props: LeftPanelProps) {
    return (
        <div id="LeftPanel">
            <Menu></Menu>
        </div>
    );
}

export default LeftPanel;